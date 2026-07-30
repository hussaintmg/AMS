const crypto = require('crypto');
const Vehicle = require('../../models/Vehicle.model');
const { canonicalStatus } = require('../../utils/vehicleLifecycle');
const { debugEvent } = require('./importDebugAudit');

const clean = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
const normalizeId = (value) => clean(value).toUpperCase().replace(/\s+/g, '');

function add(map, key, vehicle) {
  const value = normalizeId(key);
  if (!value) return;
  const entries = map.get(value) || [];
  entries.push(vehicle);
  map.set(value, entries);
}

function vehicleImportIdentity({ chassisNumber, vin, engineNumber } = {}) {
  const identity = normalizeId(chassisNumber || vin || engineNumber);
  return identity ? `vehicle:${crypto.createHash('sha256').update(identity).digest('hex')}` : '';
}

class VehicleIndex {
  constructor(vehicles = []) {
    this.vehicles = vehicles;
    this.byChassis = new Map();
    this.byEngine = new Map();
    this.nextCode = 1;
    vehicles.forEach((vehicle) => this.add(vehicle));
  }

  static async load({ session = null } = {}) {
    let query = Vehicle.find({}).lean();
    if (session) query = query.session(session);
    return new VehicleIndex(await query);
  }

  add(vehicle) {
    if (!vehicle?._id) return;
    if (!this.vehicles.some((entry) => String(entry._id) === String(vehicle._id))) this.vehicles.push(vehicle);
    add(this.byChassis, vehicle.chassisNumber || vehicle.vin, vehicle);
    add(this.byEngine, vehicle.engineNumber, vehicle);
    const codeMatch = clean(vehicle.vehicleCode).match(/^VEH-(\d+)$/i);
    if (codeMatch) this.nextCode = Math.max(this.nextCode, Number(codeMatch[1]) + 1);
  }

  allocateVehicleCode() {
    const code = `VEH-${String(this.nextCode).padStart(5, '0')}`;
    this.nextCode += 1;
    return code;
  }

  resolve({ chassisNumber, vin, engineNumber, _meta = null, stage = '' } = {}) {
    let selected = null;
    let selectedBy = null;
    const normalizedChassis = normalizeId(chassisNumber || vin);
    const normalizedEngine = normalizeId(engineNumber);
    const candidates = [
      ['chassisNumber', normalizedChassis, this.byChassis],
      ['engineNumber', normalizedEngine, this.byEngine],
    ];
    const query = {
      chassisNumber: normalizedChassis || null,
      engineNumber: normalizedEngine || null,
    };
    const finish = (result) => {
      const vehicle = result.vehicle || null;
      const status = canonicalStatus(vehicle?.status) || vehicle?.status || '';
      const soldOrDispatched = Boolean(vehicle && (
        ['sold', 'dispatched', 'delivered'].includes(status)
        || vehicle.isStockOut
        || vehicle.stockOut
      ));
      const eventPayload = {
        _meta,
        importStage: stage,
        sourceChassisVin: chassisNumber || vin || '',
        sourceEngineNumber: engineNumber || '',
        existingVehicleQuery: query,
        matchMethod: result.matchBy || null,
        existingVehicleId: vehicle?._id ? String(vehicle._id) : null,
        existingVehicleCompleteDetails: vehicle,
        vehicleDetails: vehicle ? {
          make: vehicle.make || null,
          model: vehicle.model || null,
          variant: vehicle.variant || null,
          colour: vehicle.color || null,
          year: vehicle.year || null,
          currentStatus: vehicle.status || '',
          canonicalStatus: status,
          stockStatus: {
            isStockOut: Boolean(vehicle.isStockOut || vehicle.stockOut),
            stockOutDate: vehicle.stockOutDate || null,
          },
          bookingRelation: vehicle.booking || null,
          salesRelation: vehicle.salesOrder || null,
          invoiceRelation: vehicle.invoice || null,
          dispatchRelation: vehicle.dispatch || vehicle.dispatchNumber || null,
        } : null,
        reused: Boolean(vehicle),
        created: false,
        ambiguous: Boolean(result.ambiguous),
        conflict: Boolean(result.conflict),
        candidateCount: result.count || (vehicle ? 1 : 0),
        soldOrDispatched,
      };
      let bucket = vehicle ? 'existingReused' : null;
      if (result.conflict || result.ambiguous) bucket = 'conflicts';
      else if (soldOrDispatched) bucket = 'alreadySoldOrDispatched';
      debugEvent('vehicle.lookup', eventPayload, {
        section: bucket ? 'vehicles' : null,
        bucket,
        level: result.ambiguous ? 'error' : (soldOrDispatched && stage ? 'warn' : 'info'),
      });
      return result;
    };
    for (const [field, value, map] of candidates) {
      if (!value) continue;
      const matches = map.get(value) || [];
      if (matches.length > 1) return finish({ vehicle: null, matchBy: field, ambiguous: true, count: matches.length });
      if (matches.length === 1) {
        if (selected && String(selected._id) !== String(matches[0]._id)) {
          return finish({ vehicle: null, matchBy: `${selectedBy}/${field}`, ambiguous: true, conflict: true, count: 2 });
        }
        selected = matches[0];
        selectedBy = field;
      }
    }
    if (selected) {
      const storedChassis = normalizeId(selected.chassisNumber || selected.vin);
      const storedEngine = normalizeId(selected.engineNumber);
      if (normalizedChassis && storedChassis && normalizedChassis !== storedChassis) {
        return finish({
          vehicle: null,
          matchBy: `${selectedBy}/chassisNumber`,
          ambiguous: true,
          conflict: true,
          count: 2,
        });
      }
      if (normalizedEngine && storedEngine && normalizedEngine !== storedEngine) {
        return finish({
          vehicle: null,
          matchBy: `${selectedBy}/engineNumber`,
          ambiguous: true,
          conflict: true,
          count: 2,
        });
      }
    }
    return finish({ vehicle: selected, matchBy: selectedBy });
  }

  async resolveOrCreate(data, hierarchy, { session = null, userId = null, allowCreate = true } = {}) {
    const resolved = this.resolve(data);
    debugEvent('vehicle.resolution.started', {
      _meta: data._meta,
      importStage: data.stage || '',
      sourceChassisVin: data.chassisNumber || data.vin || '',
      sourceEngineNumber: data.engineNumber || '',
      matchMethod: resolved.matchBy || null,
      existingVehicleId: resolved.vehicle?._id ? String(resolved.vehicle._id) : null,
      allowCreate,
    });
    if (resolved.vehicle || resolved.ambiguous || !allowCreate) return { ...resolved, created: false };
    const chassisNumber = clean(data.chassisNumber || data.vin);
    const engineNumber = clean(data.engineNumber);
    if (!chassisNumber && !engineNumber) {
      debugEvent('vehicle.creation.failed', {
        _meta: data._meta,
        importStage: data.stage || '',
        sourceChassisVin: chassisNumber,
        sourceEngineNumber: engineNumber,
        creationFailureReason: 'Both chassis/VIN and engine number are missing.',
        missingField: 'chassisNumber/engineNumber',
      }, { section: 'vehicles', bucket: 'failed', level: 'error' });
      return { vehicle: null, matchBy: null, created: false, missingField: 'chassisNumber/engineNumber' };
    }
    if (!hierarchy?.make || !hierarchy?.model) {
      debugEvent('vehicle.creation.failed', {
        _meta: data._meta,
        importStage: data.stage || '',
        sourceChassisVin: chassisNumber,
        sourceEngineNumber: engineNumber,
        creationFailureReason: 'Resolved Make -> Model hierarchy is incomplete.',
        missingField: 'vehicleHierarchy',
      }, { section: 'vehicles', bucket: 'failed', level: 'error' });
      return { vehicle: null, matchBy: null, created: false, missingField: 'vehicleHierarchy' };
    }

    const year = Number(data.modelYear || hierarchy.model.year);
    if (!Number.isFinite(year) || year < 1900) {
      debugEvent('vehicle.creation.failed', {
        _meta: data._meta,
        importStage: data.stage || '',
        sourceChassisVin: chassisNumber,
        sourceEngineNumber: engineNumber,
        creationFailureReason: 'Model year is missing or invalid.',
        missingField: 'modelYear',
      }, { section: 'vehicles', bucket: 'failed', level: 'error' });
      return { vehicle: null, matchBy: null, created: false, missingField: 'modelYear' };
    }
    const document = {
      vehicleCode: this.allocateVehicleCode(),
      importIdentityKey: vehicleImportIdentity({ chassisNumber, engineNumber }),
      vin: chassisNumber,
      chassisNumber,
      engineNumber,
      make: {
        name: hierarchy.make.name,
        code: hierarchy.make.code || '',
        country: hierarchy.make.country || '',
      },
      model: {
        name: hierarchy.model.name,
        code: hierarchy.model.code || '',
        yearFrom: hierarchy.model.year || year,
        yearTo: hierarchy.model.year || year,
      },
      variant: {
        name: hierarchy.variant?.name || '',
        code: hierarchy.variant?.code || '',
        engineType: hierarchy.model.fuel_type || '',
        transmission: hierarchy.model.transmission || '',
        fuelType: hierarchy.model.fuel_type || '',
        price: Number(hierarchy.variant?.base_price || 0),
      },
      color: {
        name: hierarchy.color?.name || clean(data.colorName),
        code: hierarchy.color?.code || '',
        hexCode: hierarchy.color?.hex_code || '',
      },
      year,
      purchasePrice: Number(data.purchasePrice || 0),
      salePrice: Number(data.salePrice || 0),
      status: canonicalStatus(data.status) || 'available',
      arrivalDate: data.bookingDate || data.orderDate || null,
      createdBy: userId,
    };

    try {
      const vehicle = session
        ? (await Vehicle.create([document], { session }))[0]
        : await Vehicle.create(document);
      const plain = vehicle.toObject();
      this.add(plain);
      debugEvent('vehicle.creation.completed', {
        _meta: data._meta,
        importStage: data.stage || '',
        sourceChassisVin: chassisNumber,
        sourceEngineNumber: engineNumber,
        newVehicleId: String(plain._id),
        newlyCreated: true,
        completeDetails: plain,
      }, { section: 'vehicles', bucket: 'newlyCreated' });
      return { vehicle: plain, matchBy: 'created', created: true };
    } catch (error) {
      if (error.code === 11000 && document.importIdentityKey) {
        let query = Vehicle.findOne({ importIdentityKey: document.importIdentityKey }).lean();
        if (session) query = query.session(session);
        const vehicle = await query;
        if (vehicle) {
          this.add(vehicle);
          debugEvent('vehicle.creation.race_reused', {
            _meta: data._meta,
            importStage: data.stage || '',
            sourceChassisVin: chassisNumber,
            sourceEngineNumber: engineNumber,
            existingVehicleId: String(vehicle._id),
            reused: true,
            completeDetails: vehicle,
          }, { section: 'vehicles', bucket: 'existingReused' });
          return { vehicle, matchBy: 'importIdentityKey', created: false };
        }
      }
      debugEvent('vehicle.creation.failed', {
        _meta: data._meta,
        importStage: data.stage || '',
        sourceChassisVin: chassisNumber,
        sourceEngineNumber: engineNumber,
        creationFailureReason: error.message,
        errorName: error.name,
        errorCode: error.code || null,
      }, { section: 'vehicles', bucket: 'failed', level: 'error' });
      throw error;
    }
  }
}

async function findExistingVehicle(data = {}) {
  const index = await VehicleIndex.load();
  return index.resolve(data);
}

module.exports = {
  VehicleIndex,
  findExistingVehicle,
  normalizeVehicleIdentifier: normalizeId,
  vehicleImportIdentity,
};

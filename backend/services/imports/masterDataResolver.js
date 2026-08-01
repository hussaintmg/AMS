const {
  VehicleVariant,
  VehicleModel,
  VehicleMake,
  VehicleColor,
} = require('../../models/VehicleMaster.model');

const clean = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
const normalize = (value) => clean(value)
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[_/\\-]+/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

class MasterResolutionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'MasterResolutionError';
    this.code = 'MASTER_DATA_RESOLUTION';
    this.details = details;
  }
}

function addToMap(map, key, value) {
  if (!key) return;
  const values = map.get(key) || [];
  values.push(value);
  map.set(key, values);
}

function uniqueFromMap(map, key, label, details = {}) {
  const matches = map.get(key) || [];
  if (matches.length > 1) {
    throw new MasterResolutionError(`${label} "${details.value || key}" is ambiguous (${matches.length} records).`, {
      ...details,
      stage: label,
      value: key,
      count: matches.length,
    });
  }
  return matches[0] || null;
}

function assertActive(record, label, value, details = {}) {
  if (record?.is_active === false) {
    throw new MasterResolutionError(`${label} "${value}" exists but is inactive.`, {
      ...details,
      stage: label,
      value,
      inactive: true,
    });
  }
  return record;
}

function metadataValue(result) {
  const document = result?.value || result;
  const value = document?.toObject ? document.toObject() : document;
  const created = result?.lastErrorObject ? !result.lastErrorObject.updatedExisting : true;
  return { value, created };
}

function descriptorParts({ vehicleDescription, brandName, modelName, variantName } = {}, index = null) {
  const explicitBrand = clean(brandName);
  const explicitModel = clean(modelName);
  let explicitVariant = clean(variantName);
  const description = clean(vehicleDescription);

  if (explicitBrand && explicitModel) {
    if (!explicitVariant && description && normalize(description) !== normalize(explicitModel)) explicitVariant = description;
    return {
      brandName: explicitBrand,
      modelName: explicitModel,
      variantName: explicitVariant,
      source: 'separate_columns',
      original: description || [explicitBrand, explicitModel, explicitVariant].filter(Boolean).join(' '),
    };
  }

  if (!description) {
    return { brandName: explicitBrand, modelName: explicitModel, variantName: explicitVariant, source: 'partial_columns', original: '' };
  }

  const originalTokens = description.split(/\s+/).filter(Boolean);
  const normalizedDescription = normalize(description);
  if (index) {
    const exactVariants = index.variants.filter((variant) => normalize(variant.name) === normalizedDescription);
    if (exactVariants.length > 1) {
      throw new MasterResolutionError(`Vehicle variant "${description}" is ambiguous (${exactVariants.length} records).`, {
        stage: 'Variant',
        value: description,
        count: exactVariants.length,
      });
    }
    if (exactVariants.length === 1) {
      const variant = exactVariants[0];
      const model = index.models.find((entry) => String(entry._id) === String(variant.model_id));
      const make = model && index.makes.find((entry) => String(entry._id) === String(model.make_id));
      if (make && model) {
        return {
          brandName: make.name,
          modelName: model.name,
          variantName: variant.name,
          source: 'exact_variant',
          original: description,
        };
      }
    }
  }
  let matchedMake = null;
  if (index) {
    matchedMake = index.makes
      .filter((make) => {
        const makeName = normalize(make.name);
        return normalizedDescription === makeName || normalizedDescription.startsWith(`${makeName} `);
      })
      .sort((left, right) => normalize(right.name).length - normalize(left.name).length)[0] || null;
  }

  const makeTokenCount = matchedMake ? normalize(matchedMake.name).split(' ').length : 1;
  const parsedBrand = explicitBrand || matchedMake?.name || originalTokens.slice(0, makeTokenCount).join(' ');
  const afterMake = originalTokens.slice(makeTokenCount);
  if (!afterMake.length) {
    return { brandName: parsedBrand, modelName: explicitModel, variantName: explicitVariant, source: matchedMake ? 'known_make' : 'inferred_prefix', original: description };
  }

  let matchedModel = null;
  if (matchedMake && index) {
    const remainder = normalize(afterMake.join(' '));
    matchedModel = index.models
      .filter((model) => String(model.make_id) === String(matchedMake._id))
      .filter((model) => {
        const modelValue = normalize(model.name);
        return remainder === modelValue || remainder.startsWith(`${modelValue} `);
      })
      .sort((left, right) => normalize(right.name).length - normalize(left.name).length)[0] || null;
  }

  const modelTokenCount = matchedModel ? normalize(matchedModel.name).split(' ').length : 1;
  const parsedModel = explicitModel || matchedModel?.name || afterMake.slice(0, modelTokenCount).join(' ');
  const parsedVariant = explicitVariant || afterMake.slice(modelTokenCount).join(' ');
  return {
    brandName: parsedBrand,
    modelName: parsedModel,
    variantName: parsedVariant,
    source: matchedMake ? (matchedModel ? 'known_hierarchy' : 'known_make') : 'inferred_prefix',
    original: description,
  };
}

class MasterDataIndex {
  constructor({ makes = [], models = [], variants = [], colors = [] } = {}) {
    this.makes = makes;
    this.models = models;
    this.variants = variants;
    this.colors = colors;
    this.makeMap = new Map();
    this.modelMap = new Map();
    this.variantMap = new Map();
    this.colorMap = new Map();
    makes.forEach((make) => addToMap(this.makeMap, normalize(make.name), make));
    models.forEach((model) => addToMap(this.modelMap, `${model.make_id}:${normalize(model.name)}`, model));
    variants.forEach((variant) => addToMap(this.variantMap, `${variant.model_id}:${normalize(variant.name)}`, variant));
    colors.forEach((color) => addToMap(this.colorMap, normalize(color.name), color));
  }

  static async load({ session = null } = {}) {
    let makesQuery = VehicleMake.find({}).lean();
    let modelsQuery = VehicleModel.find({}).lean();
    let variantsQuery = VehicleVariant.find({}).lean();
    let colorsQuery = VehicleColor.find({}).lean();
    if (session) {
      makesQuery = makesQuery.session(session);
      modelsQuery = modelsQuery.session(session);
      variantsQuery = variantsQuery.session(session);
      colorsQuery = colorsQuery.session(session);
    }
    const [makes, models, variants, colors] = await Promise.all([makesQuery, modelsQuery, variantsQuery, colorsQuery]);
    return new MasterDataIndex({ makes, models, variants, colors });
  }

  addMake(make) {
    this.makes.push(make);
    addToMap(this.makeMap, normalize(make.name), make);
  }

  addModel(model) {
    this.models.push(model);
    addToMap(this.modelMap, `${model.make_id}:${normalize(model.name)}`, model);
  }

  addVariant(variant) {
    this.variants.push(variant);
    addToMap(this.variantMap, `${variant.model_id}:${normalize(variant.name)}`, variant);
  }

  addColor(color) {
    this.colors.push(color);
    addToMap(this.colorMap, normalize(color.name), color);
  }

  resolveReferencedHierarchy({
    vehicleMake = null,
    vehicleModel = null,
    vehicleVariant = null,
    variantName = '',
  } = {}) {
    let variant = vehicleVariant
      ? this.variants.find((entry) => String(entry._id) === String(vehicleVariant))
      : null;
    if (!variant && normalize(variantName)) {
      const matches = this.variants.filter((entry) => normalize(entry.name) === normalize(variantName));
      if (matches.length > 1) {
        throw new MasterResolutionError(`Vehicle variant "${variantName}" is ambiguous (${matches.length} records).`, {
          stage: 'Variant', value: variantName, count: matches.length,
        });
      }
      [variant] = matches;
    }
    let model = vehicleModel
      ? this.models.find((entry) => String(entry._id) === String(vehicleModel))
      : null;
    if (!model && variant) model = this.models.find((entry) => String(entry._id) === String(variant.model_id));
    let make = vehicleMake
      ? this.makes.find((entry) => String(entry._id) === String(vehicleMake))
      : null;
    if (!make && model) make = this.makes.find((entry) => String(entry._id) === String(model.make_id));
    if (!make || !model) return null;
    if (variant && String(variant.model_id) !== String(model._id)) {
      throw new MasterResolutionError(`Vehicle variant "${variant.name}" is not linked to model "${model.name}".`, {
        stage: 'Variant', value: variant.name,
      });
    }
    if (String(model.make_id) !== String(make._id)) {
      throw new MasterResolutionError(`Vehicle model "${model.name}" is not linked to make "${make.name}".`, {
        stage: 'Model', value: model.name,
      });
    }
    return {
      make,
      model,
      variant: variant || null,
      color: null,
      parsed: { source: 'stored_references' },
      created: { makes: 0, models: 0, variants: 0 },
    };
  }

  async getOrCreateMake(name, { createMissing = true, session = null } = {}) {
    const normalizedName = normalize(name);
    if (!normalizedName) throw new MasterResolutionError('Vehicle brand could not be determined.', { stage: 'Brand', value: name });
    const existing = uniqueFromMap(this.makeMap, normalizedName, 'Brand', { value: name });
    if (existing) return { value: assertActive(existing, 'Brand', name), created: false };
    if (!createMissing) throw new MasterResolutionError(`Vehicle brand "${name}" was not found.`, { stage: 'Brand', value: name });
    const query = { normalized_name: normalizedName };
    const update = { $setOnInsert: { name: clean(name), normalized_name: normalizedName, is_active: true } };
    const result = await VehicleMake.findOneAndUpdate(query, update, {
      upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, includeResultMetadata: true, session,
    });
    const { value, created } = metadataValue(result);
    this.addMake(value);
    return { value, created };
  }

  async getOrCreateModel(make, name, { createMissing = true, session = null, modelYear = null } = {}) {
    const normalizedName = normalize(name);
    if (!normalizedName) throw new MasterResolutionError('Vehicle model could not be determined.', { stage: 'Model', brand: make.name, value: name });
    const key = `${make._id}:${normalizedName}`;
    const existing = uniqueFromMap(this.modelMap, key, 'Model', { brand: make.name, value: name });
    if (existing) return { value: assertActive(existing, 'Model', name, { brand: make.name }), created: false };
    if (!createMissing) throw new MasterResolutionError(`Vehicle model "${name}" was not found under brand "${make.name}".`, { stage: 'Model', brand: make.name, value: name });
    const setOnInsert = { make_id: make._id, name: clean(name), normalized_name: normalizedName, is_active: true };
    if (Number.isFinite(Number(modelYear)) && Number(modelYear) >= 1900) setOnInsert.year = Number(modelYear);
    const result = await VehicleModel.findOneAndUpdate(
      { make_id: make._id, normalized_name: normalizedName },
      { $setOnInsert: setOnInsert },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, includeResultMetadata: true, session },
    );
    const { value, created } = metadataValue(result);
    this.addModel(value);
    return { value, created };
  }

  async getOrCreateVariant(model, name, { createMissing = true, session = null, basePrice = null } = {}) {
    const normalizedName = normalize(name);
    if (!normalizedName) return { value: null, created: false };
    const key = `${model._id}:${normalizedName}`;
    const existing = uniqueFromMap(this.variantMap, key, 'Variant', { model: model.name, value: name });
    if (existing) return { value: assertActive(existing, 'Variant', name, { model: model.name }), created: false };
    if (!createMissing) throw new MasterResolutionError(`Vehicle variant "${name}" was not found under model "${model.name}".`, { stage: 'Variant', model: model.name, value: name });
    const setOnInsert = { model_id: model._id, name: clean(name), normalized_name: normalizedName, is_active: true };
    if (Number.isFinite(Number(basePrice)) && Number(basePrice) >= 0) setOnInsert.base_price = Number(basePrice);
    const result = await VehicleVariant.findOneAndUpdate(
      { model_id: model._id, normalized_name: normalizedName },
      { $setOnInsert: setOnInsert },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, includeResultMetadata: true, session },
    );
    const { value, created } = metadataValue(result);
    this.addVariant(value);
    return { value, created };
  }

  async resolveHierarchy(input, options = {}) {
    const parts = descriptorParts(input, this);
    const makeResult = await this.getOrCreateMake(parts.brandName, options);
    const modelResult = await this.getOrCreateModel(makeResult.value, parts.modelName, {
      ...options,
      modelYear: input.modelYear,
    });
    const variantResult = await this.getOrCreateVariant(modelResult.value, parts.variantName, {
      ...options,
      basePrice: input.basePrice,
    });
    return {
      make: makeResult.value,
      model: modelResult.value,
      variant: variantResult.value,
      parsed: parts,
      created: {
        makes: Number(makeResult.created),
        models: Number(modelResult.created),
        variants: Number(variantResult.created),
      },
    };
  }

  async resolveColor(name, { createMissing = true, session = null } = {}) {
    const normalizedName = normalize(name);
    if (!normalizedName) return { color: null, created: false };
    const existing = uniqueFromMap(this.colorMap, normalizedName, 'Color', { value: name });
    if (existing) return { color: assertActive(existing, 'Color', name), created: false };
    if (!createMissing) throw new MasterResolutionError(`Vehicle color "${name}" was not found.`, { stage: 'Color', value: name });
    const result = await VehicleColor.findOneAndUpdate(
      { normalized_name: normalizedName },
      { $setOnInsert: { name: clean(name), normalized_name: normalizedName, is_active: true } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, includeResultMetadata: true, session },
    );
    const { value: color, created } = metadataValue(result);
    this.addColor(color);
    return { color, created };
  }
}

async function resolveVariant(variantName) {
  const index = await MasterDataIndex.load();
  const resolved = await index.resolveHierarchy({ vehicleDescription: variantName }, { createMissing: false });
  return resolved.variant ? { variant: resolved.variant, model: resolved.model, make: resolved.make } : null;
}

async function resolveColor(colorName) {
  const index = await MasterDataIndex.load();
  const resolved = await index.resolveColor(colorName, { createMissing: false });
  return resolved.color;
}

const loadVariants = async () => (await MasterDataIndex.load()).variants;
const loadColors = async () => (await MasterDataIndex.load()).colors;
const resetCache = () => {};

module.exports = {
  MasterDataIndex,
  MasterResolutionError,
  descriptorParts,
  normalizeVehicleName: normalize,
  resolveVariant,
  resolveColor,
  loadVariants,
  loadColors,
  resetCache,
};

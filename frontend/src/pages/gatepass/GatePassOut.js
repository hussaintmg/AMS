import React from 'react';
import GatePassList from './GatePassList';

/** Gate Pass Out — logistic exits with GRN, customer exits against invoices (page `gatepass_out`). */
export default function GatePassOut() {
  return <GatePassList direction="out" />;
}

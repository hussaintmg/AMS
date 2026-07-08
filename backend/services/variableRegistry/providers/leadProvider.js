const leadProvider = {
  name: 'lead',
  label: 'Lead',
  getVariables: () => [
    { key: 'lead.status', label: 'Status', type: 'text', description: 'Lead status' },
    { key: 'lead.source', label: 'Source', type: 'text', description: 'Lead source' },
    { key: 'lead.priority', label: 'Priority', type: 'text', description: 'Lead priority' },
    { key: 'lead.notes', label: 'Notes', type: 'text', description: 'Lead notes' },
  ],
  resolve: (vars, context) => {
    const lead = context?.lead || {};
    return {
      'lead.status': lead.status || '',
      'lead.source': lead.source || '',
      'lead.priority': lead.priority || '',
      'lead.notes': lead.notes || '',
    };
  }
};

module.exports = leadProvider;

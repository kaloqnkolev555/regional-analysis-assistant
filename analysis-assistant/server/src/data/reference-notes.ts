export interface ReferenceNote {
  topic: string;
  note: string;
}

export const referenceNotes: readonly ReferenceNote[] = [
  {
    topic: 'Jobs',
    note: 'Employers report skills gaps. Small apprenticeship pilots could connect young people with local businesses.',
  },
  {
    topic: 'Transport',
    note: 'Seasonal road closures delay access to markets. Maintaining existing routes may be more feasible than building new ones.',
  },
  {
    topic: 'Flooding',
    note: 'Drainage maintenance and early warnings could reduce disruption. Local delivery capacity is limited.',
  },
];

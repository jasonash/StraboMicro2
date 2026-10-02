/**
 * What differs between two copies of a project, for the linking dialog
 * (collaboration spec v3, 16am).
 */

/** "2 micrographs, 12 spots" from counts per entity type */
export function describeDifferences(byType: Record<string, number>): string {
  const names: Record<string, [string, string]> = {
    project: ['project details', 'project details'],
    dataset: ['dataset', 'datasets'],
    sample: ['sample', 'samples'],
    micrograph: ['micrograph', 'micrographs'],
    spot: ['spot', 'spots'],
    tag: ['tag', 'tags'],
    group: ['group', 'groups'],
    point_count: ['point count', 'point counts'],
  };
  const order = Object.keys(names);
  return Object.entries(byType)
    .sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99))
    .map(([type, n]) => {
      const [one, many] = names[type] ?? [type.replace(/_/g, ' '), `${type.replace(/_/g, ' ')}s`];
      return type === 'project' ? one : `${n} ${n === 1 ? one : many}`;
    })
    .join(', ');
}

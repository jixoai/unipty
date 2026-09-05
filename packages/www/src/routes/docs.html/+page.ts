// Page data seam for the docs ToC (jixoai-ui 0.3.0, 2026-09-06): the root
// layout's chrome snippet composes the registry Toc tree from this data —
// structure lives in the layout, data stays serializable across the load
// boundary (the ui-site pattern). Ids match the section/h3 anchors in
// +page.svelte.
export interface DocsTocNode {
  id: string
  label: string
  children?: DocsTocNode[]
}

export function load(): { toc: DocsTocNode[] } {
  return {
    toc: [
      {
        id: 'overview',
        label: 'Overview',
        children: [{ id: 'architecture', label: 'Architecture' }],
      },
      {
        id: 'core',
        label: 'Core usage',
        children: [
          { id: 'core-construct', label: 'Construct' },
          { id: 'core-spawn', label: 'Spawn' },
          { id: 'core-stream', label: 'Stream' },
          { id: 'core-write', label: 'Write' },
          { id: 'core-resize', label: 'Resize' },
          { id: 'core-lifecycle', label: 'Lifecycle' },
          { id: 'core-exit', label: 'Exit' },
          { id: 'core-capability', label: 'Capabilities' },
          { id: 'core-dispose', label: 'Dispose' },
        ],
      },
      {
        id: 'acquisition',
        label: 'Backend acquisition',
        children: [
          { id: 'acquisition-manual', label: 'Manual import' },
          { id: 'acquisition-auto', label: 'AutoResolve' },
          { id: 'acquisition-resolve', label: 'Resolve and inspect' },
          { id: 'acquisition-manifest', label: 'Bundled manifest' },
        ],
      },
      { id: 'routes', label: 'Official routes' },
      {
        id: 'metadata',
        label: 'Metadata protocol',
        children: [
          { id: 'metadata-schema', label: 'Schema' },
          { id: 'metadata-targets', label: 'Target tokens' },
        ],
      },
      { id: 'browser-limits', label: 'Browser limits' },
    ],
  }
}

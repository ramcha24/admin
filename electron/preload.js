const { contextBridge, ipcRenderer } = require('electron')
const invoke = (ch, ...a) => ipcRenderer.invoke(ch, ...a)

contextBridge.exposeInMainWorld('api', {
  // Tool discovery & management
  discoverTools:    ()           => invoke('tools:discover'),
  launchTool:       (id)        => invoke('tools:launch', id),
  stopTool:         (id)        => invoke('tools:stop', id),
  getToolStatus:    ()           => invoke('tools:status'),

  // New tool planning & scaffolding
  planTool:         (description)        => invoke('tools:plan', description),
  scaffoldTool:     (name, plan)         => invoke('tools:scaffold', name, plan),
  openClaudeCode:   (toolName, plan)     => invoke('tools:openClaudeCode', toolName, plan),

  // LLM (routes to Claude or Ollama)
  llmComplete:      (opts)               => invoke('llm:complete', opts),

  // Ideas
  getIdeas:         ()                   => invoke('ideas:getAll'),
  saveIdea:         (data)               => invoke('ideas:save', data),
  updateIdea:       (data)               => invoke('ideas:update', data),
  deleteIdea:       (id)                 => invoke('ideas:delete', id),
  polishIdea:       (rawText)            => invoke('ideas:polish', rawText),
  extractIdeas:     (rawText)            => invoke('ideas:extract', rawText),
  planIdea:         (idea)               => invoke('ideas:plan', idea),

  // Inter-tool event bus
  publishEvent:     (sourceId, eventType, payload) => invoke('events:publish', sourceId, eventType, payload),
  pollEvents:       (toolId)             => invoke('events:poll', toolId),

  // Settings
  getSetting:       (key)                => invoke('settings:get', key),
  getAllSettings:    ()                   => invoke('settings:getAll'),
  setSetting:       (key, value)         => invoke('settings:set', { key, value }),

  // Shell
  openExternal:     (url)                => invoke('shell:openExternal', url),
})

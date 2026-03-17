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

  // Village — members
  getVillageMembers:     ()       => invoke('village:getMembers'),
  addVillageMember:      (data)   => invoke('village:addMember', data),
  setVillageAccess:      (data)   => invoke('village:setAccess', data),
  syncVillage:           ()       => invoke('village:sync'),
  getVillageStatus:      ()       => invoke('village:getStatus'),
  getVillageIdentity:    ()       => invoke('village:getIdentity'),
  updateVillageIdentity: (data)   => invoke('village:updateIdentity', data),
  // Village — inbox
  getVillageInteractions: ()      => invoke('village:getInteractions'),
  markVillageRead:        (ids)   => invoke('village:markRead', ids),
  getVillageUnreadCount:  ()      => invoke('village:getUnreadCount'),
  villageReply:           (data)  => invoke('village:reply', data),
  // Village — tags
  getVillageTags:        ()       => invoke('village:getTags'),
  saveVillageTag:        (data)   => invoke('village:saveTag', data),
  deleteVillageTag:      (id)     => invoke('village:deleteTag', id),
  assignVillageTag:      (data)   => invoke('village:assignTag', data),

  // Shell
  openExternal:     (url)                => invoke('shell:openExternal', url),
})

const { contextBridge, ipcRenderer } = require('electron')
const invoke = (ch, ...a) => ipcRenderer.invoke(ch, ...a)

contextBridge.exposeInMainWorld('api', {
  // Tool discovery & management
  discoverTools:    ()           => invoke('tools:discover'),
  launchTool:       (id)        => invoke('tools:launch', id),
  stopTool:         (id)        => invoke('tools:stop', id),
  getToolStatus:    ()           => invoke('tools:status'),
  updateToolDevInfo:(data)       => invoke('tools:updateDevInfo', data),
  resumeTool:       (id)        => invoke('tools:resume', id),

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
  ingestIdeaFile:   (data)              => invoke('ideas:ingestFile', data),
  saveIdeaFile:     (data)              => invoke('ideas:saveFile', data),
  openIdeaFile:     (filePath)          => invoke('ideas:openFile', filePath),

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
  updateVillageMember:          (data)   => invoke('village:updateMember', data),
  regenerateVillageMemberToken: (id)     => invoke('village:regenerateMemberToken', id),
  getVillageMemberAccess:       (id)     => invoke('village:getMemberAccess', id),
  setVillageNotificationFreq:   (data)   => invoke('village:setNotificationFrequency', data),
  getVillagePreviewFeed:        (id)     => invoke('village:getPreviewFeed', id),
  setVillageAccess:      (data)   => invoke('village:setAccess', data),
  syncVillage:           ()       => invoke('village:sync'),
  getVillageStatus:      ()       => invoke('village:getStatus'),
  getVillageIdentity:    ()       => invoke('village:getIdentity'),
  updateVillageIdentity: (data)   => invoke('village:updateIdentity', data),
  // Village — inbox
  getVillageInteractions: ()      => invoke('village:getInteractions'),
  getVillageActivity:     ()      => invoke('village:getActivity'),
  markVillageRead:        (ids)   => invoke('village:markRead', ids),
  getVillageUnreadCount:  ()      => invoke('village:getUnreadCount'),
  villageReply:           (data)  => invoke('village:reply', data),
  // Village — tags
  getVillageTags:        ()       => invoke('village:getTags'),
  saveVillageTag:        (data)   => invoke('village:saveTag', data),
  deleteVillageTag:      (id)     => invoke('village:deleteTag', id),
  assignVillageTag:      (data)   => invoke('village:assignTag', data),

  // Workflows
  getWorkflows:     ()                   => invoke('workflows:getAll'),
  saveWorkflow:     (data)               => invoke('workflows:save', data),
  updateWorkflow:   (data)               => invoke('workflows:update', data),
  deleteWorkflow:   (id)                 => invoke('workflows:delete', id),

  // Digest
  runDigestNow:     ()                   => invoke('digest:runNow'),

  // Shell
  openExternal:     (url)                => invoke('shell:openExternal', url),

  // Capabilities
  getCapabilities:  ()                   => invoke('capabilities:getAll'),
  callCapability:   (serviceId, payload) => invoke('capabilities:call', serviceId, payload),

  // Issues
  getIssues:        (toolId)             => invoke('issues:getAll', toolId),
  saveIssue:        (data)               => invoke('issues:save', data),
  updateIssue:      (data)               => invoke('issues:update', data),
  deleteIssue:      (id)                 => invoke('issues:delete', id),
  startIssueSession:(id)                 => invoke('issues:startSession', id),

  // User stories
  getStories:       ()                   => invoke('stories:getAll'),

  // Filesystem (code / doc browser)
  fsListDir:        (dirPath)            => invoke('fs:listDir', dirPath),
  fsReadFile:       (filePath)           => invoke('fs:readFile', filePath),

  // Dev utilities
  runSeed:          ()                   => invoke('seed:run'),
  clearSeed:        ()                   => invoke('seed:clear'),
})

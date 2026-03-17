/**
 * @file preload.js
 * @description Electron context-bridge preload script for the Admin renderer.
 *
 * Exposes a curated `window.api` object to the React renderer process via
 * Electron's `contextBridge`. Every method is a thin wrapper that calls
 * `ipcRenderer.invoke()` with a named IPC channel; all actual business logic
 * lives in `electron/main.js`.
 *
 * Context isolation is enabled — the renderer has no direct access to Node.js
 * or Electron APIs. This file is the only sanctioned bridge between the two.
 *
 * @module preload
 */

const { contextBridge, ipcRenderer } = require('electron')

/**
 * Thin helper that invokes an IPC channel with optional arguments.
 *
 * @param {string} ch - IPC channel name (e.g. `'tools:discover'`).
 * @param {...*} a - Arguments forwarded to the main-process handler.
 * @returns {Promise<*>} Resolves with whatever the main-process handler returns.
 */
const invoke = (ch, ...a) => ipcRenderer.invoke(ch, ...a)

/**
 * Public API surface exposed to the Admin renderer process via contextBridge.
 *
 * All methods are async (return a Promise) because they go through IPC.
 * The object is available in the renderer as `window.api`.
 *
 * @namespace window.api
 */
contextBridge.exposeInMainWorld('api', {
  // ── Tool discovery & management ──────────────────────────────────────────

  /** Scan the Admin parent directory for tool.json manifests and upsert the registry. @returns {Promise<object[]>} Array of tool objects. */
  discoverTools:    ()           => invoke('tools:discover'),
  /** Launch a registered tool (stable .app or dev server). @param {string} id - Tool slug. @returns {Promise<{ok:boolean,mode?:string,pid?:number,error?:string}>} */
  launchTool:       (id)        => invoke('tools:launch', id),
  /** Send SIGTERM to a running tool process. @param {string} id - Tool slug. @returns {Promise<{ok:boolean,error?:string}>} */
  stopTool:         (id)        => invoke('tools:stop', id),
  /** Return a map of tool IDs to their current run state ('running'|'stopped'). @returns {Promise<Record<string,'running'|'stopped'>>} */
  getToolStatus:    ()           => invoke('tools:status'),
  /** Persist dev_phase, dev_summary, next_steps, and stable_tag for a tool. @param {{id:string,dev_phase:string,dev_summary:string,next_steps:string[],stable_tag:string|null}} data @returns {Promise<{ok:boolean}>} */
  updateToolDevInfo:(data)       => invoke('tools:updateDevInfo', data),
  /** Open Terminal and resume (or start) a Claude Code session for the tool. @param {string} id - Tool slug. @returns {Promise<{ok:boolean,error?:string}>} */
  resumeTool:       (id)        => invoke('tools:resume', id),
  /** Discover a packaged .app in the tool's release/ dir and record it as launch.app. @param {string} id - Tool slug. @returns {Promise<{ok:boolean,appPath?:string,version?:string,stableTag?:string,error?:string}>} */
  publishTool:      (id)        => invoke('tools:publish', id),

  // ── New tool planning & scaffolding ──────────────────────────────────────

  /** Use the Claude API to generate an implementation plan for a new tool. @param {string} description - Natural-language description of the tool. @returns {Promise<{ok:boolean,plan?:string,error?:string}>} */
  planTool:         (description)        => invoke('tools:plan', description),
  /** Scaffold a new tool directory from the standard template files. @param {string} name - Human-readable tool name. @param {string} plan - Markdown plan written to PLAN.md. @returns {Promise<{ok:boolean,toolDir?:string,error?:string}>} */
  scaffoldTool:     (name, plan)         => invoke('tools:scaffold', name, plan),
  /** Open Terminal with `npm install && claude '<plan>'` in the tool directory. @param {string} toolName - Tool slug or name. @param {string} plan - Initial Claude Code prompt. @returns {Promise<{ok:boolean,error?:string}>} */
  openClaudeCode:   (toolName, plan)     => invoke('tools:openClaudeCode', toolName, plan),

  // ── LLM (routes to Claude or Ollama based on settings) ──────────────────

  /** Send a chat completion request to Claude or Ollama. @param {{messages:object[],systemPrompt?:string,maxTokens?:number}} opts @returns {Promise<{ok:boolean,text?:string,error?:string}>} */
  llmComplete:      (opts)               => invoke('llm:complete', opts),

  // ── Ideas ────────────────────────────────────────────────────────────────

  /** Fetch all stored ideas, ordered newest-first. @returns {Promise<object[]>} */
  getIdeas:         ()                   => invoke('ideas:getAll'),
  /** Persist a new idea. @param {{title:string,summary:string,raw_text:string,tags?:string[],source?:string,source_filename?:string,attached_file_path?:string}} data @returns {Promise<{ok:boolean,id:number}>} */
  saveIdea:         (data)               => invoke('ideas:save', data),
  /** Update title, summary, and tags for an existing idea. @param {{id:number,title:string,summary:string,tags:string[]}} data @returns {Promise<{ok:boolean}>} */
  updateIdea:       (data)               => invoke('ideas:update', data),
  /** Delete an idea by ID. @param {number} id @returns {Promise<{ok:boolean}>} */
  deleteIdea:       (id)                 => invoke('ideas:delete', id),
  /** Use the configured LLM to clean and structure a raw text note into a single idea. @param {string} rawText @returns {Promise<{ok:boolean,title?:string,summary?:string,tags?:string[],error?:string}>} */
  polishIdea:       (rawText)            => invoke('ideas:polish', rawText),
  /** Extract multiple distinct ideas from a long text or conversation dump. @param {string} rawText @returns {Promise<{ok:boolean,ideas?:object[],error?:string}>} */
  extractIdeas:     (rawText)            => invoke('ideas:extract', rawText),
  /** Open Terminal with Claude Code in plan mode for a stored idea. @param {{id:number,title:string,summary:string}} idea @returns {Promise<{ok:boolean,error?:string}>} */
  planIdea:         (idea)               => invoke('ideas:plan', idea),
  /** Ingest a file (PDF, DOCX, text, etc.) and extract ideas from it via LLM. @param {{filename:string,dataBase64:string,mimeType:string}} data @returns {Promise<{ok:boolean,ideas?:object[],error?:string}>} */
  ingestIdeaFile:   (data)              => invoke('ideas:ingestFile', data),
  /** Save an attached file to the idea-files store; returns its on-disk path. @param {{filename:string,dataBase64:string}} data @returns {Promise<{ok:boolean,path?:string}>} */
  saveIdeaFile:     (data)              => invoke('ideas:saveFile', data),
  /** Open an attached idea file in the default macOS app. @param {string} filePath @returns {Promise<{ok:boolean}>} */
  openIdeaFile:     (filePath)          => invoke('ideas:openFile', filePath),

  // ── Inter-tool event bus ─────────────────────────────────────────────────

  /** Publish an event to the bus; triggers any matching enabled workflows. @param {string} sourceId - Tool slug. @param {string} eventType @param {object} payload @returns {Promise<{ok:boolean,id:number}>} */
  publishEvent:     (sourceId, eventType, payload) => invoke('events:publish', sourceId, eventType, payload),
  /** Poll unconsumed events for a tool and mark them as consumed. @param {string} toolId @returns {Promise<object[]>} */
  pollEvents:       (toolId)             => invoke('events:poll', toolId),

  // ── Settings ─────────────────────────────────────────────────────────────

  /** Read a single settings value by key. @param {string} key @returns {Promise<string|null>} */
  getSetting:       (key)                => invoke('settings:get', key),
  /** Read all settings as a plain key→value object. @returns {Promise<Record<string,string>>} */
  getAllSettings:    ()                   => invoke('settings:getAll'),
  /** Write a settings value. @param {string} key @param {string} value @returns {Promise<true>} */
  setSetting:       (key, value)         => invoke('settings:set', { key, value }),

  // ── Village — members ────────────────────────────────────────────────────

  /** Return all village members ordered by join date (newest first). @returns {Promise<object[]>} */
  getVillageMembers:     ()       => invoke('village:getMembers'),
  /** Add a new village member and generate their secure feed token. @param {{name:string,email:string,avatarEmoji?:string,tagId?:string|null}} data @returns {Promise<{ok:boolean,id:string,token:string,url:string}>} */
  addVillageMember:      (data)   => invoke('village:addMember', data),
  /** Update a member's email and tag assignment. @param {{id:string,email:string,tagId:string|null}} data @returns {Promise<{ok:boolean}>} */
  updateVillageMember:          (data)   => invoke('village:updateMember', data),
  /** Rotate a member's feed token and return the new secure feed URL. @param {string} id - Member ID. @returns {Promise<{ok:boolean,token:string,url:string}>} */
  regenerateVillageMemberToken: (id)     => invoke('village:regenerateMemberToken', id),
  /** Return a member's per-tool access overrides and digest frequency. @param {string} id - Member ID. @returns {Promise<{access:Record<string,string>,frequency:string}>} */
  getVillageMemberAccess:       (id)     => invoke('village:getMemberAccess', id),
  /** Set how often a member receives email digests. @param {{memberId:string,frequency:'daily'|'weekly'|'never'}} data @returns {Promise<{ok:boolean}>} */
  setVillageNotificationFreq:   (data)   => invoke('village:setNotificationFrequency', data),
  /** Compute and return a member's personalised activity feed. @param {string} id - Member ID. @returns {Promise<{member:object,identity:object,items:object[]}|null>} */
  getVillagePreviewFeed:        (id)     => invoke('village:getPreviewFeed', id),
  /** Set (or revoke) a member's access level for a specific tool. @param {{memberId:string,toolId:string,level:string|null}} data @returns {Promise<{ok:boolean}>} */
  setVillageAccess:      (data)   => invoke('village:setAccess', data),
  /** Trigger a full village sync (Grove + Think activity + Supabase push/pull). @returns {Promise<{ok:boolean,supabase:object}>} */
  syncVillage:           ()       => invoke('village:sync'),
  /** Return the village server status and URLs. @returns {Promise<{running:boolean,port:number,url:string,testUrl:string}>} */
  getVillageStatus:      ()       => invoke('village:getStatus'),
  /** Return the owner's village identity card. @returns {Promise<{id:number,username:string,display_name:string,avatar_emoji:string}|undefined>} */
  getVillageIdentity:    ()       => invoke('village:getIdentity'),
  /** Update the owner's village identity (username, display_name, avatar_emoji). @param {{username:string,display_name:string,avatar_emoji:string}} data @returns {Promise<{ok:boolean}>} */
  updateVillageIdentity: (data)   => invoke('village:updateIdentity', data),

  // ── Village — inbox ───────────────────────────────────────────────────────

  /** Return all village interactions (comments, reactions, replies) newest-first. @returns {Promise<object[]>} */
  getVillageInteractions: ()      => invoke('village:getInteractions'),
  /** Return all village activities with per-member visibility and interaction lists. @returns {Promise<object[]>} */
  getVillageActivity:     ()      => invoke('village:getActivity'),
  /** Mark a list of interaction IDs as read. @param {string[]} ids @returns {Promise<{ok:boolean}>} */
  markVillageRead:        (ids)   => invoke('village:markRead', ids),
  /** Return the count of unread interactions. @returns {Promise<number>} */
  getVillageUnreadCount:  ()      => invoke('village:getUnreadCount'),
  /** Post an owner reply to an activity thread. @param {{activityId:string,body:string}} data @returns {Promise<{ok:boolean,id:string}>} */
  villageReply:           (data)  => invoke('village:reply', data),

  // ── Village — tags ────────────────────────────────────────────────────────

  /** Return all relationship tags with their default access rules. @returns {Promise<object[]>} */
  getVillageTags:        ()       => invoke('village:getTags'),
  /** Create or update a tag and its default access entries. @param {{id?:string,name:string,emoji?:string,defaults?:object[]}} data @returns {Promise<{ok:boolean,id:string}>} */
  saveVillageTag:        (data)   => invoke('village:saveTag', data),
  /** Delete a tag and clear it from all members. @param {string} id - Tag ID. @returns {Promise<{ok:boolean}>} */
  deleteVillageTag:      (id)     => invoke('village:deleteTag', id),
  /** Assign (or remove) a tag from a member. @param {{memberId:string,tagId:string|null}} data @returns {Promise<{ok:boolean}>} */
  assignVillageTag:      (data)   => invoke('village:assignTag', data),

  // ── Workflows ─────────────────────────────────────────────────────────────

  /** Return all workflow rules ordered by creation date. @returns {Promise<object[]>} */
  getWorkflows:     ()                   => invoke('workflows:getAll'),
  /** Create a new workflow rule. @param {{name:string,trigger_tool:string,trigger_event:string,action_tool?:string,action_type:string,action_payload?:string}} data @returns {Promise<{ok:boolean,id:number}>} */
  saveWorkflow:     (data)               => invoke('workflows:save', data),
  /** Toggle a workflow's enabled state. @param {{id:number,enabled:boolean}} data @returns {Promise<{ok:boolean}>} */
  updateWorkflow:   (data)               => invoke('workflows:update', data),
  /** Delete a workflow rule by ID. @param {number} id @returns {Promise<{ok:boolean}>} */
  deleteWorkflow:   (id)                 => invoke('workflows:delete', id),

  // ── Digest ────────────────────────────────────────────────────────────────

  /** Immediately run the daily email digest for all eligible members. @returns {Promise<{sent:number,results:object[]}|{skipped:boolean,reason:string}>} */
  runDigestNow:     ()                   => invoke('digest:runNow'),

  // ── Shell ──────────────────────────────────────────────────────────────────

  /** Open a URL in the user's default browser. @param {string} url @returns {Promise<true>} */
  openExternal:     (url)                => invoke('shell:openExternal', url),

  // ── Capabilities ──────────────────────────────────────────────────────────

  /** Return all discovered service contracts with gateway URLs and schemas. @returns {Promise<object[]>} */
  getCapabilities:  ()                   => invoke('capabilities:getAll'),
  /** Validate a payload against a service's input schema and proxy it to the target tool. @param {string} serviceId @param {object} payload @returns {Promise<object>} */
  callCapability:   (serviceId, payload) => invoke('capabilities:call', serviceId, payload),

  // ── Issues ────────────────────────────────────────────────────────────────

  /** Return all issues, optionally filtered to a single tool. @param {string} [toolId] @returns {Promise<object[]>} */
  getIssues:        (toolId)             => invoke('issues:getAll', toolId),
  /** Create a new issue record. @param {{tool_id:string,type:'bug'|'feature',title:string,description?:string}} data @returns {Promise<object>} The saved issue row. */
  saveIssue:        (data)               => invoke('issues:save', data),
  /** Update issue fields (partial update — only defined fields are changed). @param {{id:number,title?:string,description?:string,status?:string,resolution_note?:string}} data @returns {Promise<object>} The updated issue row. */
  updateIssue:      (data)               => invoke('issues:update', data),
  /** Delete an issue by ID. @param {number} id @returns {Promise<{ok:boolean}>} */
  deleteIssue:      (id)                 => invoke('issues:delete', id),
  /** Open Terminal with a Claude Code session pre-loaded with the issue context. Creates a feature branch and auto-closes the issue when the session ends. @param {number|number[]} ids - One or more issue IDs. @returns {Promise<{ok:boolean,error?:string}>} */
  startIssueSession:(ids)                => invoke('issues:startSession', ids),

  // ── User stories ──────────────────────────────────────────────────────────

  /** Parse USER_STORIES.md files from all tools and return structured story objects. @returns {Promise<object[]>} */
  getStories:       ()                   => invoke('stories:getAll'),

  // ── Filesystem (code / doc browser) ──────────────────────────────────────

  /** List a directory's contents, filtering out node_modules, .git, dist, etc. @param {string} dirPath @returns {Promise<{name:string,path:string,isDir:boolean,ext:string|null}[]>} */
  fsListDir:        (dirPath)            => invoke('fs:listDir', dirPath),
  /** Read a source file; restricted to the Admin workspace and Library directories. @param {string} filePath @returns {Promise<{content:string}|{error:string}>} */
  fsReadFile:       (filePath)           => invoke('fs:readFile', filePath),

  // ── Dev utilities ─────────────────────────────────────────────────────────

  /** Seed the database with sample members, activities, interactions, and ideas. @returns {Promise<{ok:boolean,message:string}>} */
  runSeed:          ()                   => invoke('seed:run'),
  /** Remove all data inserted by the seed run. @returns {Promise<{ok:boolean,message:string}>} */
  clearSeed:        ()                   => invoke('seed:clear'),
})

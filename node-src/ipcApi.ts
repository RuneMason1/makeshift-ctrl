export const ctrlIpcApi = {
  test: 'mkshft-test',
  call: {
    openCueFolder: 'shell-openCueFolder',
    runCue: 'mkshft-runCue',
    pauseCtrlSerial: 'mkshft-pause-ctrl-serial',
    resumeCtrlSerial: 'mkshft-resume-ctrl-serial',
    uploadFirmware: 'mkshft-upload-firmware',
    fetchBlocklyToolbox: 'blockly-fetch-toolbox',
    fetchBlocklyBlocks: 'blockly-fetch-blocks',
    fetchBlocklyDefaultWorkspace: 'blockly-fetch-defaultWorkspace',
  },
  get: {
    deviceEvents: 'mkshft-get-device-events',
    serialEvents: 'mkshft-get-serial-events',
    hardwareDescriptors: 'mkshft-get-hardware-descriptors',
    eventsAsList: 'mkshft-get-events-list',
    connectedDevices: 'mkshft-get-connectedDevices',
    coreStatus: 'mkshft-get-coreStatus',
    logRank: 'mkshft-get-logRank',
    clientSize: 'window-get-size',
    allCues: 'cue-get-all',
    allBlocklySerialWorkspaceNames: 'blockly-get-all-serialWorkspace-names',
    blocklyToolbox: 'blockly-get-toolbox',
    blocklySerialWorkspace: 'blockly-get-serialWorkspace',
    blockGenerator: 'blockly-get-blockGenerator',
    cuesAttachedToEvent: 'cue-get-attachedToEvent',
    cueById: 'cue-get-byId',
    cueByFolder: 'cue-get-byFolder',
    currentView: 'mkshft-get-currentView',
    visualPreferences: 'mkshft-get-visualPreferences',
    defaultTheme: 'theme-get-default',
    themeFromPath: 'theme-get-fromPath',
  },
  set: {
    cueFile: 'mkshft-set-cueFile',
    cueForEvent: 'mkshft-set-cueForEvent',
    currentView: 'mkshft-set-currentView',
    visualPreferences: 'mkshft-set-visualPreferences',
    serialWorkspaceAsCue: 'mkshft-set-serialWorkspaceAsCue',
  },
  delete: {
    workspace: 'blockly-delete-workspace',
  },
  onEv: {
    app: {
      updateAvailable: 'mkshft-ev-app-updateAvailable',
    },
    blockly: {
      toolboxUpdate: 'blockly-toolbox-sync',
      blocksUpdate: 'blockly-blocks-sync',
      workspaceUpdate: 'blockly-workspace-sync',
      workspaceListUpdate: 'blockly-workspaceList-sync',
    },
    cue: {
      added: 'cue-added',
      changed: 'cue-changed',
      removed: 'cue-deleted',
    },
    device: {
      connected: 'mkshft-ev-device-connected',
      disconnected: 'mkshft-ev-device-disconnected',
    },
    terminal: {
      data: 'mkshft-ev-term-data'
    },
  },
}


export const storeKeys = {
  LogLevel: 'logLevel',
  UuidNamespace: 'uuidNamespace',
  MainWindowState: 'mainWindowState',
  DeviceLayout: 'deviceLayout',
  CurrentView: 'currentView',
  VisualPreferences: 'visualPreferences',
}

export type VisualPreferences = {
  splashImageId: number,
  ledColor: string,
  usbConnectedColor: string,
  usbDisconnectedColor: string,
}

export type CtrlIpcApi = typeof ctrlIpcApi
export type StoreKeys = typeof storeKeys

# Custom NSIS macros for the Windows installer (electron-builder "include").
#
# Registers the strabomicro:// URL protocol at INSTALL time. electron-builder's
# "protocols" config only covers macOS (Info.plist) and Linux (.desktop); its
# NSIS templates have no protocol support, so without this the registry keys
# are first written when the app runs (app.setAsDefaultProtocolClient) and
# "Open in StraboMicro" web links do nothing on a machine where the app was
# installed but never launched. The runtime call remains as a re-assert.
#
# SHCTX resolves to HKCU for per-user installs and HKLM for per-machine,
# matching wherever the rest of the install is registered.

!macro customInstall
  WriteRegStr SHCTX "Software\Classes\strabomicro" "" "URL:StraboMicro Protocol"
  WriteRegStr SHCTX "Software\Classes\strabomicro" "URL Protocol" ""
  WriteRegStr SHCTX "Software\Classes\strabomicro\DefaultIcon" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr SHCTX "Software\Classes\strabomicro\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

# Remove the protocol registration on uninstall so links do not point at a
# missing executable (this also cleans up keys written at runtime by
# app.setAsDefaultProtocolClient, which uses the same location). During an
# app UPDATE the old uninstaller runs first and deletes the key, then the
# new installer's customInstall immediately rewrites it, so updates are safe.
!macro customUnInstall
  DeleteRegKey SHCTX "Software\Classes\strabomicro"
!macroend

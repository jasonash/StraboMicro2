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

# Updating from an unsigned version (2.0.49 and older) with Smart App Control
# On: before installing, the installer runs the OLD version's uninstaller,
# which is unsigned, so Windows blocks it ("Error launching installer") and
# the update quits after five tries (found on Win11 2026-10-06, 2.0.49 ->
# 2.0.50). In that case clear the old UninstallString so the old uninstaller
# is skipped and the new files are installed over the old ones; a successful
# install writes a fresh entry with the new, signed uninstaller.
#
# customInit runs in .onInit. For an all-users install the instance that
# installs is the elevated inner one, which runs .onInit again, so the HKLM
# write succeeds there (it fails harmlessly in the outer instance).
# VerifiedAndReputablePolicyState: 0 Off, 1 On, 2 Evaluation (not blocking).
!include WordFunc.nsh

!macro skipUnsignedOldUninstaller ROOT
  ClearErrors
  ReadRegStr $1 ${ROOT} "${UNINSTALL_REGISTRY_KEY}" DisplayVersion
  ${If} $1 != ""
    ${VersionCompare} $1 "2.0.50" $2
    ${If} $2 == 2
      DeleteRegValue ${ROOT} "${UNINSTALL_REGISTRY_KEY}" UninstallString
    ${EndIf}
  ${EndIf}
!macroend

!macro customInit
  Push $0
  Push $1
  Push $2
  ClearErrors
  ReadRegDWORD $0 HKLM "SYSTEM\CurrentControlSet\Control\CI\Policy" "VerifiedAndReputablePolicyState"
  ${If} $0 == 1
    !insertmacro skipUnsignedOldUninstaller HKLM
    !insertmacro skipUnsignedOldUninstaller HKCU
  ${EndIf}
  ClearErrors
  Pop $2
  Pop $1
  Pop $0
!macroend

# Remove the protocol registration on uninstall so links do not point at a
# missing executable (this also cleans up keys written at runtime by
# app.setAsDefaultProtocolClient, which uses the same location). During an
# app UPDATE the old uninstaller runs first and deletes the key, then the
# new installer's customInstall immediately rewrites it, so updates are safe.
!macro customUnInstall
  DeleteRegKey SHCTX "Software\Classes\strabomicro"
!macroend

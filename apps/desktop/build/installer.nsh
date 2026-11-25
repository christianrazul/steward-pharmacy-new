# Installer wording and pages. electron-builder includes this file automatically (it sits in
# buildResources). The art beside it comes from scripts/installer-art.mjs.
#
# Install flow: Welcome (the button reads "Install") -> progress -> Finish ("Open now" ticked).
# There are no other choices: the app installs for all users in Program Files.

!ifndef BUILD_UNINSTALLER
  !define MUI_FINISHPAGE_TITLE "Steward Pharmacy is ready"
  !define MUI_FINISHPAGE_TEXT "Open it any time from the Steward Pharmacy shortcut on the desktop or in the Start menu.$\r$\n$\r$\nFirst time on this PC? An admin adds the counter in Settings > Devices and gives you a one-time code to enter."
  !define MUI_FINISHPAGE_RUN_TEXT "Open Steward Pharmacy now"
!endif

!macro customWelcomePage
  # Re-running the installer to update skips straight to the progress page.
  !insertmacro skipPageIfUpdated
  !define MUI_WELCOMEPAGE_TITLE "Install Steward Pharmacy"
  !define MUI_WELCOMEPAGE_TEXT "This sets up the Steward Pharmacy counter app on this PC and adds a shortcut to the desktop.$\r$\n$\r$\nIt takes about a minute.$\r$\n$\r$\nClick Install to start."
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW stewardWelcomeShow
  !insertmacro MUI_PAGE_WELCOME

  # The welcome page is the only step before installing, so its button says so.
  Function stewardWelcomeShow
    GetDlgItem $0 $HWNDPARENT 1
    SendMessage $0 ${WM_SETTEXT} 0 "STR:$(^InstallBtn)"
  FunctionEnd
!macroend

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Remove Steward Pharmacy"
  !define MUI_WELCOMEPAGE_TEXT "This removes the Steward Pharmacy app from this PC.$\r$\n$\r$\nSales and stock saved on this counter are kept, so installing it again picks up where it left off.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend

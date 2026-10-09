PS-AMS — Portable Edition (no installation required)
=====================================================

RUN
  1. Keep PS-AMS.exe and portable.flag together in this folder.
  2. Double-click PS-AMS.exe. That's it — no installer, no admin rights.

WHERE YOUR DATA LIVES
  • Media files & automatic backups:  PS-AMS-Data\  (created next to the exe)
  • SQLite database:                  %APPDATA%\in.patternsports.psams\ps-ams.db
  • The database is automatically copied into PS-AMS-Data\backups\ every
    time the app closes, so your records always have a copy next to the exe.

MOVE TO ANOTHER PC
  Copy this folder, then copy the ps-ams.db file from
  %APPDATA%\in.patternsports.psams\ on the old PC into the same folder
  on the new PC (with the app closed).

TROUBLESHOOTING
  • If the window does not open, open PS-AMS-Data\boot.log (or
    %LOCALAPPDATA%\PS-AMS\boot.log) and share the last lines — the app
    writes every boot step and any error there.
  • First launch on a fresh PC may take a few extra seconds while the
    WebView2 runtime initialises.

System requirements: Windows 10/11 64-bit. No internet needed after
download — everything runs locally and offline.

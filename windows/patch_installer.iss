; ─────────────────────────────────────────────────────────────────────────
; Inno Setup 7 Script: LogiFlow Lightweight Patch & Update Installer
; Packages external updater/ and signed .wms payload (~8-25 MB)
; ─────────────────────────────────────────────────────────────────────────

#ifndef MyAppVersion
  #define MyAppVersion "1.2.0"
#endif

#ifndef WmsFile
  #define WmsFile "..\Output\logiflow-update-v1.2.0.wms"
#endif

#define MyAppName "Warehouse Management"
#define MyAppPublisher "Warehouse Systems Inc."
#define AppId "{C8E9A341-2D19-4F58-9A74-8B6C3F5E7B12}"

[Setup]
AppId={{#AppId}}
AppName={#MyAppName} Update
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} Patch v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
UsePreviousAppDir=yes
DirExistsWarning=no
CreateAppDir=no
OutputDir=..\Output
OutputBaseFilename=Update_v{#MyAppVersion}
SetupIconFile=assets\app_icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
DisableDirPage=yes
DisableReadyPage=no
; SignTool configured for CI Authenticode signing
; SignTool=signtool sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 $f

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; 1. Package the decoupled updater files into temporary folder
Source: "..\updater\*"; DestDir: "{tmp}\updater"; Flags: ignoreversion recursesubdirs createallsubdirs

; 2. Package the signed .wms update archive into temporary folder
Source: "{#WmsFile}"; DestDir: "{tmp}"; DestName: "payload.wms"; Flags: ignoreversion

[Run]
; Execute external updater using installed runtime node.exe
Filename: "{app}\runtime\node.exe"; Parameters: """{tmp}\updater\cli.js"" --package=""{tmp}\payload.wms"" --app-dir=""{app}"""; StatusMsg: "Applying LogiFlow patch and verifying database integrity..."; Flags: waituntilterminated

[Code]
// Retrieve existing application installation path from registry
function InitializeSetup(): Boolean;
var
  InstallPath: String;
begin
  Result := True;
  if RegQueryStringValue(HKEY_CURRENT_USER, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{#AppId}_is1', 'InstallLocation', InstallPath) then
  begin
    Log('Located LogiFlow installed at: ' + InstallPath);
  end
  else
  begin
    Log('LogiFlow registry location not found, will rely on default app directory.');
  end;
end;

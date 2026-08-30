; ─────────────────────────────────────────────────────────────────────────
; Inno Setup 7 Script: Warehouse Management
; Self-Contained Windows Installer with Embedded Node.js Runtime & SQLite DB
; Zero external dependencies: Runs on any Windows PC without Node.js installed!
; ─────────────────────────────────────────────────────────────────────────

#define MyAppName "Warehouse Management"
#define MyAppVersion "1.1.0"
#define MyAppPublisher "Warehouse Systems Inc."
#define MyAppURL "https://github.com"
#define MyAppExeName "launcher.bat"

[Setup]
AppId={{C8E9A341-2D19-4F58-9A74-8B6C3F5E7B12}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=Output
OutputBaseFilename=Warehouse_Management_Setup_v{#MyAppVersion}
SetupIconFile=assets\app_icon.ico
WizardImageFile=assets\wizard_image.bmp
WizardSmallImageFile=assets\wizard_small.bmp
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
DisableProgramGroupPage=yes

; ─────────────────────────────────────────────────────────────────────────
; Upgrade & Process Management
; Automatically closes running app instances and preserves install directory
; ─────────────────────────────────────────────────────────────────────────
CloseApplications=yes
CloseApplicationsFilter=*.bat,node.exe,cmd.exe
RestartApplications=no
UsePreviousAppDir=yes
DirExistsWarning=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; 1. Staged Next.js web application and dependencies
Source: "..\_dist\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "prisma\dev.db"

; 2. Embedded Standalone Node.js Runtime (Allows zero-compromise execution on PCs without Node.js)
Source: "runtime\node.exe"; DestDir: "{app}\runtime"; Flags: ignoreversion

; 3. SQLite Database: Only copy initial database on FIRST install, NEVER overwrite existing records on upgrades!
Source: "..\_dist\prisma\dev.db"; DestDir: "{app}\prisma"; Flags: onlyifdoesntexist uninsneveruninstall

; 4. Windows assets, icons, and launcher scripts
Source: "assets\*"; DestDir: "{app}\windows\assets"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "launcher.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "launcher.js"; DestDir: "{app}\windows"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\windows\assets\app_icon.ico"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\windows\assets\app_icon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: shellexec postinstall nowait skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\.next"
Type: filesandordirs; Name: "{app}\node_modules"
Type: filesandordirs; Name: "{app}\windows\Output"

[Code]
// Check for existing installation to provide smooth upgrade experience
function InitializeSetup(): Boolean;
var
  PrevVersion: String;
begin
  Result := True;
  if RegQueryStringValue(HKEY_CURRENT_USER, 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{C8E9A341-2D19-4F58-9A74-8B6C3F5E7B12}_is1', 'DisplayVersion', PrevVersion) then
  begin
    Log('Detected existing installation v' + PrevVersion + '. Proceeding with in-place upgrade.');
  end;
end;

// Post-install verification of standalone runtime
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    if not FileExists(ExpandConstant('{app}\runtime\node.exe')) then
    begin
      MsgBox('Warning: Standalone Node runtime was not detected in {app}\runtime. Please verify your installation.', mbInformation, MB_OK);
    end;
  end;
end;

; ─────────────────────────────────────────────────────────────────────────
; Inno Setup 7 Script: Warehouse Management
; Packages Next.js Server + SQLite DB + Bundled Node.js Runtime into Windows Installer EXE
; ─────────────────────────────────────────────────────────────────────────

#define MyAppName "Warehouse Management"
#define MyAppVersion "1.0.0"
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
OutputBaseFilename=Warehouse_Management_Setup
SetupIconFile=assets\app_icon.ico
WizardImageFile=assets\wizard_image.bmp
WizardSmallImageFile=assets\wizard_small.bmp
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
DisableProgramGroupPage=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; App root files and staged packages
Source: "..\_dist\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; Windows assets & icons
Source: "assets\*"; DestDir: "{app}\windows\assets"; Flags: ignoreversion recursesubdirs createallsubdirs

; Pre-configured Windows batch launcher
Source: "launcher.bat"; DestDir: "{app}"; Flags: ignoreversion

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

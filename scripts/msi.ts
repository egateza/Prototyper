import { TRAY_AUMID } from '../src/tray/host.js';
import { windowsFileVersion } from './winres.js';

/**
 * Sumber WiX (.wxs) untuk installer Windows (MSI). Murni agar bisa dites; dibangun oleh
 * scripts/release.ts dengan WiX Toolset (`wix build`, v4+).
 *
 * - Per-user (`Scope="perUser"`), tanpa hak admin/UAC. Wizard (WixUI_InstallDir, bahasa Inggris,
 *   tanpa halaman lisensi) memilih folder; default %LOCALAPPDATA%\Programs\Prototyper. Folder yang
 *   dipilih disimpan di HKCU\Software\Prototyper\InstallDir dan dipakai lagi oleh versi berikutnya.
 *   Butuh ekstensi di MSI_EXTENSIONS.
 * - Berisi prototyper.exe (runtime + aplikasi bawaan) dan installer.json (penanda instalasi MSI,
 *   dibaca `detectInstaller()`: tray lalu memperbarui runtime lewat MSI, bukan mengganti exe).
 * - Shortcut Start Menu, folder instalasi ditambahkan ke PATH pengguna, tercantum di Apps & features.
 * - MajorUpgrade: memasang versi baru otomatis mencopot versi lama.
 * - Uninstall/upgrade menjalankan `prototyper quit` (exe yang terpasang) sebelum file diperiksa, agar
 *   tray, daemon, dan prototype tidak tetap berjalan; uninstall juga menghapus entri startup. Lewat
 *   WixQuietExec agar tanpa jendela konsol (prototyper.exe adalah program konsol).
 * - Wizard: halaman selesai punya centang "Launch Prototyper" (default tercentang).
 * - Menjalankan Prototyper (akhir wizard, /passive) = membuka shortcut Start Menu lewat explorer.exe.
 *   Shortcut dibuka minimized sehingga konsol tidak tampil, dan induknya explorer.exe sehingga
 *   prototyper.exe masuk mode peluncur (tray). Bukan WixQuietExec: ia menunggu output proses sampai
 *   tuntas, dan tray yang dijalankan di latar bisa ikut memegang pipe itu sehingga installer menggantung.
 *   Jangan memakai exe peluncur GUI terpisah: prototyperw.exe tanpa tanda tangan dideteksi Defender
 *   sebagai Trojan:Win32/Bearfoos.A!ml (false positive, dicoba 2026-11-15).
 * - Tanpa wizard (/passive, /quiet), setelah dipasang tray dinyalakan (LAUNCHAPP=0 mematikannya; dipakai pembaruan dari tray yang
 *   menyalakan tray sendiri beserta prototype yang tadinya berjalan).
 */

/** Jangan diubah: Windows mengenali versi baru sebagai pembaruan lewat kode ini. */
export const MSI_UPGRADE_CODE = '2ACE26BA-0775-4986-A061-4ACCCF54FA45';

/**
 * GUID komponen, tetap selamanya (aturan komponen Windows Installer). Komponen berisi file +
 * registry keypath (wajib untuk instalasi per-user) tidak bisa memakai GUID otomatis WiX.
 * Bila isi komponen berubah (file ditambah/dihapus), buat komponen baru dengan GUID baru.
 */
export const MSI_COMPONENT_GUIDS = {
  app: '963D6F85-3813-48F5-A77F-EA9BFD58F866',
  startMenu: 'AEC49875-8259-4DD1-967F-2CF51AB6C5A1',
} as const;

/**
 * Ekstensi WiX: UI (wizard) dan Util (WixQuietExec: menjalankan perintah tanpa jendela konsol).
 * Versinya mengikuti WiX Toolset yang dipakai (docs/RELEASE.md).
 */
export const MSI_EXTENSIONS = ['WixToolset.UI.wixext', 'WixToolset.Util.wixext'] as const;
export const WIX_VERSION = '5.0.2';

/** Versi produk MSI: hanya a.b.c numerik (prerelease ikut versi intinya). */
export function msiVersion(version: string): string {
  return windowsFileVersion(version).replace(/\.0$/, '');
}

export interface WxsOptions {
  version: string;
  /** Path prototyper.exe hasil build. */
  exe: string;
  /** Path installer.json. */
  installerJson: string;
  /** Path icon .ico. */
  icon: string;
  /** URL halaman proyek (Apps & features → Support). */
  url?: string;
}

const QUIT_UNINSTALL_CONDITION = 'Installed AND REMOVE = &quot;ALL&quot; AND NOT UPGRADINGPRODUCTCODE';
const QUIT_UPGRADE_CONDITION = 'WIX_UPGRADE_DETECTED AND NOT Installed';

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function buildWxs(o: WxsOptions): string {
  const v = msiVersion(o.version);
  return `<?xml version="1.0" encoding="utf-8"?>
<Wix xmlns="http://wixtoolset.org/schemas/v4/wxs" xmlns:ui="http://wixtoolset.org/schemas/v4/wxs/ui">
  <Package Name="Prototyper" Manufacturer="Prototyper" Version="${v}" UpgradeCode="${MSI_UPGRADE_CODE}" Scope="perUser" Compressed="yes" Language="1033">
    <SummaryInformation Description="Prototyper ${xml(o.version)}" />
    <MajorUpgrade AllowSameVersionUpgrades="yes" DowngradeErrorMessage="Prototyper versi yang lebih baru sudah terpasang." />
    <MediaTemplate EmbedCab="yes" CompressionLevel="high" />

    <Icon Id="ProductIcon" SourceFile="${xml(o.icon)}" />
    <Property Id="ARPPRODUCTICON" Value="ProductIcon" />
    <Property Id="ARPNOREPAIR" Value="1" />${o.url ? `\n    <Property Id="ARPURLINFOABOUT" Value="${xml(o.url)}" />` : ''}
    <Property Id="LAUNCHAPP" Value="1" />

    <!-- folder pilihan instalasi sebelumnya: pembaruan (termasuk /passive dari tray) masuk ke folder yang sama -->
    <Property Id="INSTALLFOLDER">
      <RegistrySearch Id="PreviousInstallDir" Root="HKCU" Key="Software\\Prototyper" Name="InstallDir" Type="raw" />
    </Property>

    <!-- di luar drive Windows: tanpa rollback. Cadangan rollback ditulis ke <drive>:\\Config.Msi, yang di drive selain
         drive sistem sering hanya bisa diakses SYSTEM (dibuat installer admin lain) → instalasi per-user gagal dengan
         "Could not set file security for file 'D:\\Config.Msi\\…rbf'. Error: 5" saat upgrade/uninstall. -->
    <SetProperty Id="DISABLEROLLBACK" Value="1" Before="InstallInitialize" Sequence="execute" Condition="NOT (INSTALLFOLDER &lt;&lt; WindowsVolume)" />

    <!-- wizard: Welcome → pilih folder → Install (halaman lisensi dilewati) -->
    <UI>
      <ui:WixUI Id="WixUI_InstallDir" InstallDirectory="INSTALLFOLDER" />
      <Publish Dialog="WelcomeDlg" Control="Next" Event="NewDialog" Value="InstallDirDlg" Order="2" />
      <Publish Dialog="InstallDirDlg" Control="Back" Event="NewDialog" Value="WelcomeDlg" Order="2" />
      <!-- halaman selesai: centang "Launch Prototyper" (default tercentang) -->
      <Publish Dialog="ExitDialog" Control="Finish" Event="DoAction" Value="LaunchApp" Condition="WIXUI_EXITDIALOGOPTIONALCHECKBOX = 1 AND NOT Installed" />
    </UI>
    <Property Id="WIXUI_EXITDIALOGOPTIONALCHECKBOX" Value="1" />
    <SetProperty Id="WIXUI_EXITDIALOGOPTIONALCHECKBOXTEXT" Value="Launch Prototyper" Before="CostInitialize" Sequence="ui" Condition="NOT Installed" />

    <StandardDirectory Id="LocalAppDataFolder">
      <Directory Id="ProgramsDir" Name="Programs">
        <Directory Id="INSTALLFOLDER" Name="Prototyper" />
      </Directory>
    </StandardDirectory>
    <StandardDirectory Id="ProgramMenuFolder" />

    <ComponentGroup Id="Main" Directory="INSTALLFOLDER">
      <Component Id="App" Guid="${MSI_COMPONENT_GUIDS.app}">
        <File Id="PrototyperExe" Name="prototyper.exe" Source="${xml(o.exe)}" />
        <File Id="InstallerJson" Name="installer.json" Source="${xml(o.installerJson)}" />
        <RegistryValue Root="HKCU" Key="Software\\Prototyper" Name="InstallDir" Type="string" Value="[INSTALLFOLDER]" KeyPath="yes" />
        <Environment Id="UserPath" Name="PATH" Value="[INSTALLFOLDER]" Action="set" Part="last" System="no" Permanent="no" />
        <RemoveFolder Id="RemoveInstallFolder" On="uninstall" />
        <RemoveFolder Id="RemoveProgramsDir" Directory="ProgramsDir" On="uninstall" />
        <RemoveRegistryKey Id="RemoveTrayAumid" Root="HKCU" Key="Software\\Classes\\AppUserModelId\\${TRAY_AUMID}" Action="removeOnUninstall" />
      </Component>
      <Component Id="StartMenu" Directory="ProgramMenuFolder" Guid="${MSI_COMPONENT_GUIDS.startMenu}">
        <Shortcut Id="StartMenuShortcut" Name="Prototyper" Description="Jalankan Prototyper di tray" Target="[INSTALLFOLDER]prototyper.exe" WorkingDirectory="INSTALLFOLDER" Icon="ProductIcon" Show="minimized">
          <ShortcutProperty Key="System.AppUserModel.ID" Value="${TRAY_AUMID}" />
        </Shortcut>
        <RegistryValue Root="HKCU" Key="Software\\Prototyper" Name="StartMenuShortcut" Type="integer" Value="1" KeyPath="yes" />
      </Component>
    </ComponentGroup>

    <Feature Id="Main">
      <ComponentGroupRef Id="Main" />
    </Feature>

    <!-- tutup tray + daemon sebelum file dicek/dihapus: uninstall juga menghapus entri startup -->
    <!-- WixQuietExec (immediate) menjalankan WixQuietExecCmdLine tanpa jendela dan menunggu selesai -->
    <SetProperty Id="WixQuietExecCmdLine" Action="SetQuitUninstallCmd" Value="&quot;[INSTALLFOLDER]prototyper.exe&quot; quit --remove-startup" Before="QuitAppUninstall" Sequence="execute" Condition="${QUIT_UNINSTALL_CONDITION}" />
    <CustomAction Id="QuitAppUninstall" BinaryRef="Wix4UtilCA_$(sys.BUILDARCHSHORT)" DllEntry="WixQuietExec" Execute="immediate" Return="ignore" />
    <SetProperty Id="WixQuietExecCmdLine" Action="SetQuitUpgradeCmd" Value="&quot;[INSTALLFOLDER]prototyper.exe&quot; quit" Before="QuitAppUpgrade" Sequence="execute" Condition="${QUIT_UPGRADE_CONDITION}" />
    <CustomAction Id="QuitAppUpgrade" BinaryRef="Wix4UtilCA_$(sys.BUILDARCHSHORT)" DllEntry="WixQuietExec" Execute="immediate" Return="ignore" />
    <!-- buka shortcut Start Menu (minimized) lewat explorer: tanpa jendela konsol, sama dengan klik dari Start Menu -->
    <CustomAction Id="LaunchApp" Directory="INSTALLFOLDER" ExeCommand="&quot;[WindowsFolder]explorer.exe&quot; &quot;[ProgramMenuFolder]Prototyper.lnk&quot;" Execute="immediate" Return="asyncNoWait" />
    <InstallExecuteSequence>
      <Custom Action="QuitAppUninstall" Before="InstallValidate" Condition="${QUIT_UNINSTALL_CONDITION}" />
      <Custom Action="QuitAppUpgrade" Before="InstallValidate" Condition="${QUIT_UPGRADE_CONDITION}" />
      <!-- tanpa wizard (/passive, /quiet): LAUNCHAPP menentukan; dengan wizard (UILevel 5): centang di ExitDialog -->
      <Custom Action="LaunchApp" After="InstallFinalize" Condition="LAUNCHAPP = &quot;1&quot; AND UILevel &lt; 5 AND NOT (REMOVE = &quot;ALL&quot;)" />
    </InstallExecuteSequence>
  </Package>
</Wix>
`;
}

/** Isi installer.json (lihat `detectInstaller()` di src/core/update.ts). */
export function installerJson(version: string): string {
  return `${JSON.stringify({ kind: 'msi', version }, null, 2)}\n`;
}

# THROWAWAY spike measurement. Starts the packaged spike, checks the four criteria it can, prints JSON.
# Note: criterion 2 briefly moves the mouse pointer and clicks once on the spike's own jar, then restores the pointer.
param(
  [string]$Exe = "$PSScriptRoot\out\line-spike-win32-x64\line-spike.exe",
  [int]$Seconds = 30,
  [string]$Extra = '--dpr='
)
$ErrorActionPreference = 'Stop'
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class W {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr h);
  [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr h, IntPtr dc);
  [DllImport("gdi32.dll")] public static extern bool BitBlt(IntPtr dst, int x, int y, int w, int h, IntPtr src, int sx, int sy, uint rop);
  [DllImport("user32.dll", EntryPoint="GetWindowLongPtrW")] public static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
}
"@
Add-Type -AssemblyName System.Windows.Forms, System.Drawing

function Get-HwndAt($x, $y) { $p = New-Object W+POINT; $p.X = $x; $p.Y = $y; [W]::WindowFromPoint($p) }
function Get-PidAt($x, $y) { $procId = 0; [void][W]::GetWindowThreadProcessId((Get-HwndAt $x $y), [ref]$procId); [int]$procId }
function Move-Pointer($x, $y) {
  [void][W]::SetCursorPos($x, $y)
  [W]::mouse_event(1, 1, 0, 0, [UIntPtr]::Zero); [W]::mouse_event(1, -1, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 900
}

$stateFile = Join-Path (Split-Path $Exe) 'state.json'
Remove-Item $stateFile -ErrorAction SilentlyContinue
Get-Process line-spike -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Process -FilePath $Exe -ArgumentList '--steam-test', '--exit-after=150', $Extra

$state = $null
foreach ($i in 1..40) {
  Start-Sleep -Milliseconds 500
  if (Test-Path $stateFile) { try { $state = Get-Content $stateFile -Raw | ConvertFrom-Json } catch {} }
  if ($state -and $state.fps -gt 0) { break }
}
if (-not $state) { throw 'Spike did not report state within 20 seconds.' }
Start-Sleep -Seconds 3
$state = Get-Content $stateFile -Raw | ConvertFrom-Json
$spikePids = @(Get-Process line-spike | Select-Object -ExpandProperty Id)
$b = $state.bounds
$work = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$jarX = $b.x + $state.jar.x; $jarY = $b.y + $state.jar.y
$emptyX = $b.x + $b.width - 150; $emptyY = $b.y + 20

# Criterion 2a: empty part of the strip is click-through (default state, pointer elsewhere).
$emptyPid = Get-PidAt $emptyX $emptyY
$emptyPassesThrough = $spikePids -notcontains $emptyPid

# Criterion 2b: the jar still receives the pointer and a click.
$saved = New-Object W+POINT; [void][W]::GetCursorPos([ref]$saved)
Move-Pointer $jarX $jarY
$overJar = (Get-Content $stateFile -Raw | ConvertFrom-Json).over
$at = New-Object W+POINT; [void][W]::GetCursorPos([ref]$at)
$pointerStayed = ([math]::Abs($at.X - $jarX) -le 2) -and ([math]::Abs($at.Y - $jarY) -le 2)
$jarPid = Get-PidAt $jarX $jarY
$jarIsSpike = $spikePids -contains $jarPid
$topmostStyle = $false
$clicksAfter = $null
if ($jarIsSpike) {
  $root = [W]::GetAncestor((Get-HwndAt $jarX $jarY), 2)
  $topmostStyle = (([W]::GetWindowLongPtr($root, -20)).ToInt64() -band 0x8) -ne 0
  [W]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero); [W]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 900
  $clicksAfter = (Get-Content $stateFile -Raw | ConvertFrom-Json).clicks
}
Move-Pointer $emptyX $emptyY
$overAfterLeave = (Get-Content $stateFile -Raw | ConvertFrom-Json).over
$emptyPidAfter = Get-PidAt $emptyX $emptyY
[void][W]::SetCursorPos($saved.X, $saved.Y)

# Screenshot of the strip, for a visual check of transparency.
$shot = Join-Path $PSScriptRoot 'strip.png'
$scale = (Get-CimInstance Win32_VideoController | Select-Object -First 1).CurrentHorizontalResolution / [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width
$pw = [int]($b.width * $scale); $ph = [int]($b.height * $scale)
$bmp = New-Object System.Drawing.Bitmap $pw, $ph
$g = [System.Drawing.Graphics]::FromImage($bmp)
$src = [W]::GetDC([IntPtr]::Zero); $dst = $g.GetHdc()
[void][W]::BitBlt($dst, 0, 0, $pw, $ph, $src, [int]($b.x * $scale), [int]($b.y * $scale), 0x40CC0020)  # SRCCOPY + CAPTUREBLT (includes layered windows)
$g.ReleaseHdc($dst); [void][W]::ReleaseDC([IntPtr]::Zero, $src); $bmp.Save($shot); $g.Dispose(); $bmp.Dispose()

# Criterion 3: CPU and GPU while idling with the pointer away from the strip.
$cores = [Environment]::ProcessorCount
$cpuStart = (Get-Process line-spike | ForEach-Object { $_.TotalProcessorTime.TotalSeconds } | Measure-Object -Sum).Sum
$sw = [Diagnostics.Stopwatch]::StartNew()
$gpuSamples = @()
$pattern = '^pid_(' + ($spikePids -join '|') + ')_.*engtype_3D'
while ($sw.Elapsed.TotalSeconds -lt $Seconds) {
  $rows = Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match $pattern }
  $gpuSamples += ($rows | Measure-Object -Property UtilizationPercentage -Sum).Sum
  Start-Sleep -Milliseconds 700
}
$elapsed = $sw.Elapsed.TotalSeconds
$cpuEnd = (Get-Process line-spike | ForEach-Object { $_.TotalProcessorTime.TotalSeconds } | Measure-Object -Sum).Sum
$final = Get-Content $stateFile -Raw | ConvertFrom-Json
$memMb = [math]::Round(((Get-Process line-spike | Measure-Object -Property WorkingSet64 -Sum).Sum) / 1MB)

[ordered]@{
  electron = $final.electron; packaged = $final.packaged; items = $final.items; fps = $final.fps
  c1_alwaysOnTopFlag = $final.alwaysOnTop
  c1_topmostWindowStyle = $topmostStyle
  c1_dockedToBottom = (($b.y + $b.height) -eq ($work.Y + $work.Height)) -and ($b.width -eq $work.Width)
  displayScale = [math]::Round($scale, 2)
  c1_bounds = "$($b.x),$($b.y) $($b.width)x$($b.height)"; c1_workArea = "$($work.Width)x$($work.Height)"
  c2_emptyAreaPassesThrough = $emptyPassesThrough
  c2_pointerReachesJar = [bool]$overJar
  c2_jarWindowIsSpike = $jarIsSpike
  c2_pointerStayedOnJar = $pointerStayed
  c2_clickCounted = $clicksAfter
  c2_passesThroughAgainAfterLeaving = (-not $overAfterLeave) -and ($spikePids -notcontains $emptyPidAfter)
  c3_seconds = [math]::Round($elapsed, 1)
  c3_cpuPercentOfWholeMachine = [math]::Round(($cpuEnd - $cpuStart) / ($elapsed * $cores) * 100, 2)
  c3_cpuPercentOfOneCore = [math]::Round(($cpuEnd - $cpuStart) / $elapsed * 100, 1)
  c3_gpu3dPercentAverage = [math]::Round((($gpuSamples | Measure-Object -Average).Average), 2)
  c3_gpu3dPercentMax = ($gpuSamples | Measure-Object -Maximum).Maximum
  c3_gpuSamples = $gpuSamples.Count
  memoryMb = $memMb
  c4_steam = $final.steam
} | ConvertTo-Json -Depth 4

Get-Process line-spike -ErrorAction SilentlyContinue | Stop-Process -Force

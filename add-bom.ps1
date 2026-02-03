[byte[]]$bom = 0xEF, 0xBB, 0xBF
$content = [System.IO.File]::ReadAllBytes("c:\Users\wj941\Downloads\chamgab\install.ps1")
$combined = $bom + $content
[System.IO.File]::WriteAllBytes("c:\Users\wj941\Downloads\chamgab\install-bom.ps1", $combined)
Write-Host "BOM added successfully"

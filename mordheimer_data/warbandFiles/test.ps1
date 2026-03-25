Get-ChildItem -File -Filter *.json | ForEach-Object {
    $jsonPath = $_.FullName
    $jsonName = $_.BaseName
    $mdPath = Join-Path $_.DirectoryName ($jsonName + ".md")

    $json = Get-Content $jsonPath -Raw | ConvertFrom-Json
    $sidebarLabel = $json.warband.name

    @"
---
sidebar_label: $sidebarLabel
---

import Tooltip from '@site/src/components/Tooltip/Tooltip';
import WarbandPage from '@site/src/components/warband';
import warband from '@site/data/warbandFiles/1c/$($_.Name)';

#

<WarbandPage warband={warband} />
"@ | Set-Content -Path $mdPath -Encoding UTF8
}
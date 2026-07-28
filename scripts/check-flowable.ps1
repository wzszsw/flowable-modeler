param(
  [string]$FlowableRoot = 'D:\develop\SOURCE_CODE\flowable-engine',
  [string]$XmlPath = 'artifacts\custom-extensions-roundtrip.bpmn20.xml',
  [string]$AsyncXmlPath = 'artifacts\async-job-config-roundtrip.bpmn20.xml',
  [string]$P0XmlPath = 'artifacts\flowable-p0-extensions-roundtrip.bpmn20.xml',
  [string]$P2XmlPath = 'scripts\fixtures\flowable-p2-service-tasks.bpmn20.xml',
  [string]$InvalidServiceTaskXmlPath = 'scripts\fixtures\flowable-p2-service-task-invalid.bpmn20.xml',
  [string]$CmmnXmlPath = 'scripts\fixtures\flowable-cmmn-call-tasks.cmmn'
)

$ErrorActionPreference = 'Stop'

function Resolve-RequiredPath([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Label not found: $Path"
  }
  return (Resolve-Path -LiteralPath $Path).Path
}

function Find-LatestJar([string]$Root, [string]$Filter) {
  $jar = Get-ChildItem -LiteralPath $Root -Recurse -File -Filter $Filter |
    Where-Object { $_.Name -notmatch '-(sources|javadoc|tests)\.jar$' } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $jar) {
    throw "Dependency jar not found below: $Root ($Filter)"
  }
  return $jar.FullName
}

$resolvedFlowableRoot = Resolve-RequiredPath $FlowableRoot 'Flowable source root'
$resolvedXmlPath = Resolve-RequiredPath $XmlPath 'BPMN XML'
$resolvedAsyncXmlPath = Resolve-RequiredPath $AsyncXmlPath 'Async BPMN XML'
$resolvedP0XmlPath = Resolve-RequiredPath $P0XmlPath 'P0 extension BPMN XML'
$resolvedP2XmlPath = Resolve-RequiredPath $P2XmlPath 'P2 BPMN fixture'
$resolvedInvalidServiceTaskXmlPath = Resolve-RequiredPath $InvalidServiceTaskXmlPath 'Invalid ServiceTask BPMN fixture'
$resolvedCmmnXmlPath = Resolve-RequiredPath $CmmnXmlPath 'CMMN call-task fixture'
$mavenRepository = Resolve-RequiredPath (Join-Path $env:USERPROFILE '.m2\repository') 'Maven repository'

$classPathEntries = @(
  (Resolve-RequiredPath (Join-Path $resolvedFlowableRoot 'modules\flowable-bpmn-converter\target\classes') 'Flowable BPMN converter classes'),
  (Resolve-RequiredPath (Join-Path $resolvedFlowableRoot 'modules\flowable-bpmn-model\target\classes') 'Flowable BPMN model classes'),
  (Resolve-RequiredPath (Join-Path $resolvedFlowableRoot 'modules\flowable-process-validation\target\classes') 'Flowable process validation classes'),
  (Resolve-RequiredPath (Join-Path $resolvedFlowableRoot 'modules\flowable-cmmn-converter\target\classes') 'Flowable CMMN converter classes'),
  (Resolve-RequiredPath (Join-Path $resolvedFlowableRoot 'modules\flowable-cmmn-model\target\classes') 'Flowable CMMN model classes'),
  (Resolve-RequiredPath (Join-Path $resolvedFlowableRoot 'modules\flowable-engine-common-api\target\classes') 'Flowable common API classes'),
  (Find-LatestJar (Join-Path $mavenRepository 'org\slf4j\slf4j-api') 'slf4j-api-*.jar'),
  (Find-LatestJar (Join-Path $mavenRepository 'org\apache\commons\commons-lang3') 'commons-lang3-*.jar'),
  (Find-LatestJar (Join-Path $mavenRepository 'joda-time\joda-time') 'joda-time-*.jar')
)

$classPath = $classPathEntries -join [IO.Path]::PathSeparator
$outputDirectory = Join-Path (Get-Location) 'artifacts\flowable-check-classes'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

& javac -encoding UTF-8 -cp $classPath -d $outputDirectory `
  'scripts\FlowableBpmnCheck.java' `
  'scripts\FlowableCmmnCheck.java'
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

& java -cp ($outputDirectory + [IO.Path]::PathSeparator + $classPath) FlowableBpmnCheck `
  $resolvedXmlPath `
  $resolvedAsyncXmlPath `
  $resolvedP0XmlPath `
  $resolvedP2XmlPath `
  $resolvedInvalidServiceTaskXmlPath
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

& java -cp ($outputDirectory + [IO.Path]::PathSeparator + $classPath) FlowableCmmnCheck `
  $resolvedCmmnXmlPath
exit $LASTEXITCODE

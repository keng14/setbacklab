/**
 * UI strings (Thai / English). Rule texts live in law.js; this file covers the chrome.
 * Keys match data-i18n attributes in index.html.
 */
(function (root) {
  'use strict';

  const STRINGS = {
    appTitle:     { th: 'กฎหมายระยะร่น (Setback)', en: 'Building Setback Law Simulator' },
    appSub:       { th: 'กฎกระทรวง ฉบับที่ 55 • บ้าน ทาวน์โฮม อาคารพาณิชย์ คอนโด', en: 'Ministerial Regulation No. 55 • House, Townhome, Shophouse, Condo' },
    presetsLabel: { th: 'รูปแบบอาคาร', en: 'Building type' },
    catHouse:     { th: 'บ้าน 2 ชั้น', en: '2-Storey House' },
    catTownhome:  { th: 'ทาวน์โฮม', en: 'Townhome' },
    catShophouse: { th: 'อาคารพาณิชย์', en: 'Shophouse' },
    catCondo:     { th: 'คอนโด/หอพัก', en: 'Condo / Dorm' },
    secSite:      { th: 'ที่ดินและบริบท', en: 'Site & context' },
    secBuilding:  { th: 'ขนาดอาคาร & ระยะร่น', en: 'Building & setbacks' },
    secRow:       { th: 'คูหา & แถวต่อเนื่อง', en: 'Units & row' },
    secWall:      { th: 'ผนังติดเขต & ชายคา', en: 'Boundary wall & eaves' },
    lotWidth:     { th: 'แปลง กว้าง (ม.)', en: 'Lot width (m)' },
    lotDepth:     { th: 'แปลง ลึก (ม.)', en: 'Lot depth (m)' },
    roadWidth:    { th: 'ความกว้างถนนหน้า (ม.)', en: 'Front road width (m)' },
    subLot:       { th: 'ขนาดที่ดิน', en: 'Lot size' },
    subRoads:     { th: 'ถนน', en: 'Roads' },
    subZoning:    { th: 'ผังเมือง', en: 'Zoning' },
    subOrient:    { th: 'ทิศของที่ดิน', en: 'Lot orientation' },
    subShow:      { th: 'แสดงในภาพ', en: 'Show in view' },
    subWater:     { th: 'แหล่งน้ำ', en: 'Waterway' },
    roadWidthShort:{ th: 'กว้าง (ม.)', en: 'Width (m)' },
    secAnalysis:  { th: 'Site analysis', en: 'Site analysis' },
    subSun:       { th: 'แดด (Sun path)', en: 'Sun path' },
    subWind:      { th: 'ลม (Wind rose)', en: 'Wind rose' },
    subNoise:     { th: 'เสียงจากถนน (Noise)', en: 'Road noise' },
    showSun:      { th: 'แสดงเส้นทางแดด', en: 'Show sun path' },
    showWind:     { th: 'แสดงทิศลม', en: 'Show wind rose' },
    showNoise:    { th: 'แสดงระดับเสียงในที่ดิน (dB)', en: 'Show noise level on the lot (dB)' },
    noiseMain:    { th: 'ถนนหลัก (ที่ 10 ม.)', en: 'Main road (at 10 m)' },
    noiseSec:     { th: 'ถนนรอง (ที่ 10 ม.)', en: 'Secondary road (at 10 m)' },
    subContext:   { th: 'บริบท: เพิ่ม/ลบ อาคารและต้นไม้', en: 'Context: add / remove buildings & trees' },
    ctxAddBuilding:{ th: '+ อาคาร', en: '+ Building' },
    ctxAddTree:   { th: '+ ต้นไม้', en: '+ Tree' },
    ctxClear:     { th: 'ลบทั้งหมด', en: 'Remove all' },
    ctxReset:     { th: 'รีเซ็ตอัตโนมัติ', en: 'Reset to auto' },
    ctxList:      { th: 'รายการบริบท', en: 'Context items' },
    ctxBuilding:  { th: 'อาคาร', en: 'Building' },
    ctxTree:      { th: 'ต้นไม้', en: 'Tree' },
    ctxDelete:    { th: 'ลบ', en: 'Delete' },
    nzLotFront:   { th: 'ขอบที่ดินด้านถนนหลัก', en: 'Lot edge at main road' },
    nzBldgFront:  { th: 'หน้าอาคาร', en: 'Building front' },
    nzBldgRear:   { th: 'หลังอาคาร', en: 'Building rear' },
    nzBldgLeft:   { th: 'ข้างซ้ายอาคาร', en: 'Building left' },
    nzBldgRight:  { th: 'ข้างขวาอาคาร', en: 'Building right' },
    nzLotRear:    { th: 'ขอบที่ดินด้านหลัง', en: 'Lot rear edge' },
    nzNote:       { th: 'ค่าประมาณจากแบบจำลองถนนเป็นแหล่งกำเนิดเส้น ไม่รวมการบังของอาคาร/กำแพง/ต้นไม้ ใช้เทียบความต่างเท่านั้น', en: 'Estimate from a line-source road model; ignores shielding by buildings, walls and trees. Use for comparison only.' },
    nzQuiet:      { th: 'เงียบ-ปกติ', en: 'quiet-normal' },
    nzMid:        { th: 'ค่อนข้างดัง', en: 'moderate' },
    nzLoud:       { th: 'ดัง (เกิน 70 dB)', en: 'loud (> 70 dB)' },
    sunHour:      { th: 'เวลา (ตำแหน่งแดด)', en: 'Time (sun position)' },
    sunSeason:    { th: 'ฤดูกาล (เส้นทางแดด)', en: 'Season (sun path)' },
    windBearing:  { th: 'ลมพัดจากทิศ (ลมประจำ)', en: 'Prevailing wind from' },
    roadSidesLegend:{ th: 'ถนนรอง ติดด้านไหนบ้าง', en: 'Secondary roads on which sides' },
    mainRoadNote: { th: 'ถนนหลัก: บน (ด้านหน้าแปลง)', en: 'Main road: top (front of lot)' },
    sideLeft:     { th: 'ซ้าย', en: 'Left' },
    sideRight:    { th: 'ขวา', en: 'Right' },
    sideRear:     { th: 'ล่าง (ด้านหลัง)', en: 'Bottom (rear)' },
    showDims:     { th: 'แสดงตัวเลขระยะร่น', en: 'Show setback numbers' },
    showBuilding: { th: 'แสดงอาคารหลัก', en: 'Show main building' },
    siteBearing:  { th: 'ทิศของที่ดิน (ด้านหน้าแปลงหันไป)', en: 'Lot faces' },
    bldgBearing:  { th: 'แนวการวางอาคาร (ด้านหน้าอาคารหันไป)', en: 'Building faces' },
    hasNeighbors: { th: 'แสดงอาคารไกล้เคียง', en: 'Show neighbouring buildings' },
    showContext:  { th: 'แสดงอาคารบริบทและต้นไม้', en: 'Show context buildings & trees' },
    zoning:       { th: 'ผังเมืองสี', en: 'Zoning colour' },
    linkZoning:   { th: 'เชื่อมเกณฑ์ FAR / OSR ตามผังเมือง', en: 'Apply FAR / OSR from zoning colour' },
    hasRiver:     { th: 'ติดแม่น้ำ/คลอง (ด้านหลัง)', en: 'Waterway at rear' },
    riverWidth:   { th: 'แหล่งน้ำกว้าง (ม.)', en: 'Waterway width (m)' },
    hasBridge:    { th: 'มีสะพาน', en: 'Bridge nearby' },
    bWidth:       { th: 'อาคาร กว้าง (ม.)', en: 'Building width (m)' },
    bDepth:       { th: 'อาคาร ยาว (ม.)', en: 'Building depth (m)' },
    shape:        { th: 'รูปทรง', en: 'Shape' },
    height:       { th: 'ความสูงอาคาร (ม.)', en: 'Building height (m)' },
    frontSetback: { th: 'ร่นหน้า (จากกึ่งกลางถนน)', en: 'Front setback (from road centre)' },
    leftSetback:  { th: 'ร่นซ้าย (จากเขต)', en: 'Left setback (from lot line)' },
    center:       { th: 'จัดกึ่งกลาง', en: 'Centre' },
    fit:          { th: 'ปรับให้ผ่านเกณฑ์', en: 'Fit to legal' },
    unitWidth:    { th: 'กว้างคูหา (≥4.0)', en: 'Unit width (≥4.0)' },
    unitDepth:    { th: 'ลึกคูหา (≥4.0)', en: 'Unit depth (≥4.0)' },
    rowUnits:     { th: 'จำนวนคูหา (≤10)', en: 'Units in row (≤10)' },
    rowGap:       { th: 'ช่องว่างกลุ่ม (≥4.0)', en: 'Gap between groups (≥4.0)' },
    floorAboveWalk:{ th: 'พื้นสูงจากทางเท้า (ซม. ≥10)', en: 'Floor above sidewalk (cm ≥10)' },
    floorAboveRoad:{ th: 'พื้นสูงจากกลางถนน (ซม. ≥25)', en: 'Floor above road centre (cm ≥25)' },
    cornerUnit:   { th: 'แปลงหัวมุม (ห่างเขตอย่างน้อย 2 ม.)', en: 'Corner plot (≥2 m from neighbours)' },
    frontPublicRoad:{ th: 'ติดถนนสาธารณะ', en: 'Fronts a public road' },
    shophouseResi:{ th: 'ใช้อยู่อาศัยร่วมด้วย (OSR 30%)', en: 'Mixed residential use (OSR 30%)' },
    wallType:     { th: 'ชนิดผนังติดเขต', en: 'Boundary wall type' },
    wallOpening:  { th: 'ผนังมีช่องเปิด', en: 'Wall with openings' },
    wallSolid:    { th: 'ผนังทึบ', en: 'Solid blank wall' },
    wallGlass:    { th: 'ผนังทึบติดบล็อกแก้ว', en: 'Solid wall with glass block' },
    wallZero:     { th: 'ชิดเขตที่ดิน (<0.5 ม.)', en: 'Zero-lot (<0.5 m)' },
    gbThick:      { th: 'หนา (ซม. ≥9)', en: 'Thickness (cm ≥9)' },
    gbHeight:     { th: 'สูง (ม. >1.8)', en: 'Height (m >1.8)' },
    gbArea:       { th: 'พื้นที่ (% ≤10)', en: 'Area (% ≤10)' },
    consent:      { th: 'มีหนังสือยินยอมจากเจ้าของที่ดินข้างเคียง', en: 'Written consent from neighbour' },
    eaves:        { th: 'ชายคายื่น (ม.)', en: 'Eave projection (m)' },
    eaveHeight:   { th: 'ชายคาสูงจากทางเท้า (ม.)', en: 'Eave height above sidewalk (m)' },
    subExport:    { th: 'บันทึกภาพ (PNG)', en: 'Save images (PNG)' },
    save3d:       { th: 'บันทึกภาพ 3D', en: 'Save 3D view' },
    save2d:       { th: 'บันทึกผัง 2D', en: 'Save 2D plan' },
    subPeriods:   { th: 'ภาพ 3 ช่วงเวลา (แดด + ลม)', en: 'Three time periods (sun + wind)' },
    periodBtn:    { th: 'สร้างภาพ 3 ช่วงเวลา', en: 'Build 3-period image' },
    periodNote:   { th: 'ใช้ฤดูกาลและทิศลมที่เลือกอยู่ตอนนี้', en: 'Uses the season and wind direction currently selected' },
    periodMorning:   { th: 'เช้า', en: 'Morning' },
    periodNoon:      { th: 'กลางวัน', en: 'Midday' },
    periodAfternoon: { th: 'บ่าย', en: 'Afternoon' },
    gutter:       { th: 'มีรางน้ำฝน', en: 'Rain gutter installed' },
    view3d:       { th: '3D', en: '3D' },
    view2d:       { th: '2D แปลน', en: '2D plan' },
    viewSplit:    { th: '3D + 2D', en: '3D + 2D' },
    resetCam:     { th: 'รีเซ็ตมุมมอง', en: 'Reset view' },
    welcomeTitle: { th: 'ยินดีต้อนรับสู่ SetbackLab', en: 'Welcome to SetbackLab' },
    pickLang:     { th: 'เลือกภาษา', en: 'Choose your language' },
    howTitle:     { th: 'วิธีใช้งานแบบเร็ว', en: 'Quick guide' },
    how1:         { th: 'กำหนดที่ดิน ถนน และทิศ ในหัวข้อ "ที่ดินและบริบท"', en: 'Set the lot, roads and orientation under "Site & context".' },
    how2:         { th: 'เลือกประเภทอาคาร แล้วปรับขนาดและเลื่อนตำแหน่ง', en: 'Pick a building type, then adjust its size and position.' },
    how3:         { th: 'ดูผลผ่าน/ไม่ผ่านตามกฎกระทรวง ฉบับที่ 55 ทันที', en: 'See pass / fail against Ministerial Regulation No. 55 instantly.' },
    how4:         { th: 'ลากหมุน 3D, เปิดเต็มจอ, เลื่อนสไลด์เดอร์แดด และเปิดลมไหลใน Site analysis', en: 'Orbit the 3D view, go full screen, slide the sun and turn on wind flow in Site analysis.' },
    startApp:     { th: 'เริ่มใช้งาน', en: 'Get started' },
    helpBtn:      { th: 'วิธีใช้', en: 'Help' },
    disclaimer:   { th: 'ผลเป็นการประเมินเบื้องต้นตามกฎกระทรวง ฉบับที่ 55 (แก้ไขถึงฉบับที่ 68) ต้องตรวจกับเอกสารจริงและข้อบัญญัติท้องถิ่นก่อนใช้งานจริง', en: 'Preliminary result based on Ministerial Reg. 55 (amended to No. 68). Check against the actual documents and local ordinances before use.' },
    saveProject:  { th: 'บันทึกโปรเจกต์ (.json)', en: 'Save project (.json)' },
    loadProject:  { th: 'เปิดโปรเจกต์ (.json)', en: 'Open project (.json)' },
    projectSaved: { th: 'บันทึกไฟล์โปรเจกต์แล้ว', en: 'Project file saved' },
    projectOk:    { th: 'เปิดโปรเจกต์แล้ว', en: 'Project loaded' },
    projectBad:   { th: 'ไฟล์โปรเจกต์ไม่ถูกต้อง ไม่ได้เปลี่ยนค่าใดๆ', en: 'Invalid project file. Nothing was changed.' },
    projectSkip:  { th: 'ข้ามค่าที่ไม่รู้จักไป', en: 'Unknown fields were skipped' },
    zoneLabel:    { th: 'พื้นที่', en: 'Area' },
    secTemplate:  { th: 'แบบสำเร็จรูป', en: 'Templates' },
    templateNote: { th: 'เลือกอาคารตัวอย่างเพื่อเริ่มได้เร็ว หรือเริ่มจากที่ดินเปล่าแล้วปรับเอง ที่ดินและถนนจะไม่เปลี่ยน', en: 'Pick a sample building to start quickly, or start from the empty lot and adjust. The lot and roads stay the same.' },
    tplBlank:     { th: 'เริ่มเอง (ที่ดินเปล่า)', en: 'Start blank (empty lot)' },
    seasonRain:   { th: 'ฤดูฝน · ลม SW', en: 'Rainy season · SW wind' },
    seasonCool:   { th: 'ฤดูหนาว · ลม NE', en: 'Cool season · NE wind' },
    zoneOther:    { th: 'ต่างจังหวัด / นอก กทม.', en: 'Province / outside Bangkok' },
    zoneBkk:      { th: 'กรุงเทพมหานคร (กทม.)', en: 'Bangkok (BMA)' },
    fullscreen:   { th: 'เต็มจอ', en: 'Full screen' },
    exitFull:     { th: 'ออกจากเต็มจอ', en: 'Exit full screen' },
    autoOrbit:    { th: 'หมุนรอบที่ดิน', en: 'Orbit the lot' },
    stopOrbit:    { th: 'หยุดหมุน', en: 'Stop orbit' },
    windFlow:     { th: 'ลมไหล (effect)', en: 'Wind flow effect' },
    sunTime:      { th: 'เวลา', en: 'Time' },
    pickHelp:     { th: 'กดปุ่มแล้วจิ้มตำแหน่งในมุมมอง 3D เพื่อวางหรือลบ', en: 'Press a button, then tap the 3D view to place or delete' },
    dimsShort:    { th: 'ระยะร่น', en: 'Setbacks' },
    pickDelete:   { th: 'ลบ (จิ้มที่วัตถุ)', en: 'Delete (tap object)' },
    pickAddNote:  { th: 'จิ้มที่พื้นเพื่อวาง • กดปุ่มเดิมเพื่อยกเลิก', en: 'Tap the ground to place • press again to cancel' },
    pickDelNote:  { th: 'จิ้มอาคารหรือต้นไม้ที่ต้องการลบ', en: 'Tap a building or tree to delete it' },
    sunPlay:      { th: 'เล่นแดด', en: 'Play sun' },
    sunPause:     { th: 'หยุด', en: 'Pause' },
    riverLeft:    { th: 'ติดแหล่งน้ำ ด้านซ้าย', en: 'Waterway on the left' },
    riverRight:   { th: 'ติดแหล่งน้ำ ด้านขวา', en: 'Waterway on the right' },
    subInfra:     { th: 'โครงสร้างพื้นฐาน', en: 'Infrastructure' },
    infAddRail:   { th: '+ ทางรถไฟ', en: '+ Railway' },
    infAddExp:    { th: '+ ทางด่วน', en: '+ Expressway' },
    infAddSky:    { th: '+ รถไฟฟ้า', en: '+ Elevated rail' },
    infAddStation:{ th: '+ สถานีรถไฟฟ้า', en: '+ Station' },
    infClear:     { th: 'ลบทั้งหมด', en: 'Clear all' },
    infRail:      { th: 'ทางรถไฟ', en: 'Railway' },
    infExpressway:{ th: 'ทางด่วน', en: 'Expressway' },
    infSkytrain:  { th: 'รถไฟฟ้า', en: 'Elevated rail' },
    infStationOn: { th: 'มีสถานี', en: 'With station' },
    infSide:      { th: 'ตำแหน่ง', en: 'Side' },
    infGap:       { th: 'ห่างจากขอบ (ม.)', en: 'Gap (m)' },
    infWidth:     { th: 'กว้าง (ม.)', en: 'Width (m)' },
    infSideFront: { th: 'ฝั่งตรงข้ามถนนหน้า', en: 'Across the front road' },
    infSideRoad:  { th: 'เหนือถนนหน้า', en: 'Above the front road' },
    infSideLeft:  { th: 'ด้านซ้าย', en: 'Left side' },
    infSideRight: { th: 'ด้านขวา', en: 'Right side' },
    infSideRear:  { th: 'ด้านหลัง', en: 'Rear side' },
    toolsBtn:     { th: 'เครื่องมือ', en: 'Tools' },
    subHeat:      { th: 'ความร้อนที่ผนังอาคาร', en: 'Wall heat' },
    showHeat:     { th: 'ระบายสีผนังตามความร้อนจากแดด', en: 'Colour walls by solar heat' },
    heatLow:      { th: 'น้อย', en: 'Low' },
    heatHigh:     { th: 'มาก', en: 'High' },
    heatNote:     { th: 'รวมแสงแดดตั้งแต่ 06:00–18:00 ตามฤดูที่เลือก หลังคาแสดงเป็นสีเทา', en: 'Solar gain 06:00–18:00 for the chosen season. Roofs stay grey.' },
    hint3d:       { th: 'ลากเพื่อหมุน • เลื่อนเพื่อซูม', en: 'Drag to orbit • scroll to zoom' },
    hint2d:       { th: 'เส้นประคือระยะร่นตามกฎหมาย', en: 'Dashed lines show legal setbacks' },
    footer:       { th: 'SetbackLab • อ้างอิง พ.ร.บ. ควบคุมอาคาร พ.ศ. 2522 และกฎกระทรวง ฉบับที่ 55 (พ.ศ. 2543) • ใช้เพื่อการศึกษาเท่านั้น ไม่ใช่คำแนะนำทางกฎหมาย',
                    en: 'SetbackLab • Based on Building Control Act B.E. 2522 and Ministerial Regulation No. 55 (B.E. 2543) • For education only, not legal advice' },
    passTitle:    { th: 'ผ่านเกณฑ์ พ.ร.บ. ควบคุมอาคาร', en: 'Compliant with the Building Control Act' },
    passSub:      { th: 'ระยะร่น ผนัง ชายคา ที่ว่าง และความสูงถูกต้องตามข้อกำหนด', en: 'Setbacks, walls, eaves, open space and height all pass.' },
    failTitle:    { th: 'พบจุดที่ไม่ผ่านเกณฑ์ตามกฎหมาย', en: 'Code violation detected' },
    failSub:      { th: 'ตรวจสอบรายการสีแดงด้านล่างเพื่อแก้ไขระยะร่นหรือขนาดอาคาร', en: 'Review the red cards below to adjust setbacks or building size.' },
    passBadge:    { th: 'ผ่าน', en: 'Pass' },
    failBadge:    { th: 'ไม่ผ่าน', en: 'Fail' },
    infoBadge:    { th: 'ตรวจไม่ได้', en: 'Not checked' },
    required:     { th: 'เกณฑ์', en: 'Required' },
    current:      { th: 'ปัจจุบัน', en: 'Current' },
    fitApplied:   { th: 'ปรับขนาดให้ผ่านเกณฑ์แล้ว', en: 'Adjusted to pass all checks' },
    dimFront:     { th: 'ร่นหน้า', en: 'Front' },
    dimLeft:      { th: 'ร่นซ้าย', en: 'Left' },
    dimRight:     { th: 'ร่นขวา', en: 'Right' },
    dimRear:      { th: 'ร่นหลัง', en: 'Rear' },
    dimRoad:      { th: 'ถนน', en: 'Road' },
    dimLot:       { th: 'เขตที่ดิน', en: 'Lot line' },
    expandAll:    { th: 'ขยายทั้งหมด', en: 'Expand all' },
    collapseAll:  { th: 'ย่อทั้งหมด', en: 'Collapse all' },
    secRoof:      { th: 'หลังคา', en: 'Roof' },
    roofVisible:  { th: 'แสดงหลังคา', en: 'Show roof' },
    roofType:     { th: 'ชนิดหลังคา', en: 'Roof type' },
    roofGable:    { th: 'จั่ว (Gable)', en: 'Gable' },
    roofHip:      { th: 'ปั้นหยา (Hip)', en: 'Hip' },
    roofFlat:     { th: 'ดาดฟ้า / Flat slab', en: 'Flat slab' },
    roofShed:     { th: 'หมาแหงน (Shed)', en: 'Shed (mono-pitch)' },
    dimReq:       { th: 'เส้นเกณฑ์', en: 'Required line' }
  };

  const CATEGORY_LABEL = {
    house:     { th: 'บ้านพักอาศัย', en: 'Detached house' },
    townhome:  { th: 'ทาวน์โฮม', en: 'Townhome' },
    shophouse: { th: 'อาคารพาณิชย์', en: 'Shophouse' },
    condo:     { th: 'คอนโด/หอพัก', en: 'Condo / Dorm' }
  };

  let lang = 'th';
  const listeners = new Set();

  function t(key) {
    const entry = STRINGS[key];
    if (!entry) return key;
    return entry[lang] || entry.th || key;
  }

  function getLang() { return lang; }

  function setLang(next) {
    if (next !== 'th' && next !== 'en') return;
    lang = next;
    document.documentElement.lang = next;
    listeners.forEach(fn => fn(next));
  }

  function onChange(fn) { listeners.add(fn); }

  const OPT_EN = {
    'Yellow · สีเหลือง (อยู่อาศัยหนาแน่นน้อย)': 'Yellow · low-density residential',
    'Orange · สีส้ม (อยู่อาศัยหนาแน่นปานกลาง)': 'Orange · medium-density residential',
    'Brown · สีน้ำตาล (อยู่อาศัยหนาแน่นมาก)': 'Brown · high-density residential',
    'Red · สีแดง (พาณิชยกรรม)': 'Red · commercial',
    'N เหนือ': 'N North', 'NE ตะวันออกเฉียงเหนือ': 'NE Northeast', 'E ออก': 'E East', 'E ตะวันออก': 'E East',
    'SE ตะวันออกเฉียงใต้': 'SE Southeast', 'S ใต้': 'S South', 'SW ตะวันตกเฉียงใต้': 'SW Southwest',
    'W ตก': 'W West', 'W ตะวันตก': 'W West', 'NW ตะวันตกเฉียงเหนือ': 'NW Northwest',
    'มิ.ย. · ครีษมายัน': 'Jun · summer solstice', 'มี.ค./ก.ย. · วิษุวัต': 'Mar/Sep · equinox', 'ธ.ค. · เหมายัน': 'Dec · winter solstice',
    'มิ.ย.': 'Jun', 'มี.ค./ก.ย.': 'Mar/Sep', 'ธ.ค.': 'Dec',
    '60 dB · ซอยชุมชน': '60 dB · neighbourhood lane', '66 dB · ถนนรอง': '66 dB · side road', '72 dB · ถนนหลัก': '72 dB · main road',
    '78 dB · ถนนใหญ่รถหนาแน่น': '78 dB · busy arterial', '55 dB · ซอยเงียบ': '55 dB · quiet lane', '62 dB · ถนนรอง': '62 dB · side road',
    '68 dB · ถนนรองคับคั่ง': '68 dB · busy side road'
  };

  function applyDom(root) {
    // Only text-only elements carry data-i18n, so replacing textContent is safe.
    (root || document).querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    // <option> labels are written in Thai in the markup; swap them for English when needed
    (root || document).querySelectorAll('option:not([data-i18n])').forEach(o => {
      if (!o.dataset.th) o.dataset.th = o.textContent;
      o.textContent = getLang() === 'en' && OPT_EN[o.dataset.th] ? OPT_EN[o.dataset.th] : o.dataset.th;
    });
  }

  const api = { t, getLang, setLang, onChange, applyDom, CATEGORY_LABEL };
  root.ArchI18n = api;
})(typeof window !== 'undefined' ? window : globalThis);

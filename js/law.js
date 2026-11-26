/**
 * SetbackLab — Building Control Act (กฎกระทรวง ฉบับที่ 55) evaluation engine.
 *
 * Pure functions only: no DOM, no globals. Ported from the original single-file
 * simulator's evaluateBuildingLaw(). Every function takes a `state` object and a
 * `lang` ('th' | 'en') and returns plain data, so it can be unit-tested in Node.
 */
(function (root) {
  'use strict';

  const ZONING_SPECS = {
    yellow: { maxFAR: 1.5, minOSR: 20, color: '#eab308', nameTh: 'สีเหลือง (อยู่อาศัยหนาแน่นน้อย)', nameEn: 'Yellow (Low-Density Residential)' },
    orange: { maxFAR: 3.0, minOSR: 10, color: '#f97316', nameTh: 'สีส้ม (อยู่อาศัยหนาแน่นปานกลาง)', nameEn: 'Orange (Medium-Density Residential)' },
    brown:  { maxFAR: 6.0, minOSR: 5,  color: '#92400e', nameTh: 'สีน้ำตาล (อยู่อาศัยหนาแน่นมาก)', nameEn: 'Brown (High-Density Residential)' },
    red:    { maxFAR: 8.0, minOSR: 3,  color: '#dc2626', nameTh: 'สีแดง (พาณิชยกรรม)', nameEn: 'Red (Commercial)' }
  };

  /** Default project state — mirrors the original simulator's starting values. */
  const DEFAULT_STATE = {
    buildingCategory: 'house',
    unitWidth: 4.0, unitDepth: 8.0, rowUnits: 4, rowGap: 4.0,
    isCornerUnit: true, frontPublicRoad: true, shophouseResi: false,
    floorAboveWalk: 15, floorAboveRoad: 30,
    neighborWallType: 'opening',
    gbThick: 9.5, gbHeight: 1.90, gbAreaPct: 8,
    neighborConsent: true,
    eavesProj: 0.80, hasGutter: true, eaveHeight: 3.5,   // eaveHeight: lowest eave / projection above the sidewalk (Sec. 43)
    lotWidth: 20.0, lotDepth: 25.0,
    bWidth: 15.0, bDepth: 15.5,
    buildingShape: 'straight',
    roadWidth: 8.0,
    secLeftW: 6.0, secRightW: 6.0, secRearW: 6.0,   // secondary road width per side (m)
    showSun: false, showWind: false, windFlow: true, showHeat: false, showNoise: false,   // site analysis graphics (visual only)
    sunHour: 10, sunDecl: 0, windBearing: 225,           // hour, solar declination (deg), wind-from bearing
    noiseMain: 72, noiseSec: 62,                         // traffic noise dB(A) at 10 m from the road centre-line (main / secondary)
    ctx: null,                                           // context items; null = auto-generated, array = user-edited
    // secondary roads: which sides of the lot have one (main road is always the front)
    secLeft: false, secRight: false, secRear: false,
    showDims: true,           // visual only: show setback numbers in 3D and 2D
    showBuilding: true,       // visual only: hide the main building (setback lines and dimensions stay)
    siteBearing: 0,           // lot orientation: degrees clockwise from north that the front (main road) faces: 0=N 90=E 180=S 270=W
    bldgBearing: 0,           // building layout: degrees clockwise from north of the building front (visual, relative to lot)
    showContext: true,        // visual only: context buildings and street trees in 3D
    riverWidth: 12.0, hasRiver: false, hasBridge: false, hasNeighbors: true,
    riverLeft: false, riverLeftW: 8.0, bridgeLeft: false,     // waterways along the left / right sides (like the rear one)
    riverRight: false, riverRightW: 8.0, bridgeRight: false,
    infra: [],                                                // railway / expressway / elevated rail items, see INFRA_KINDS
    height: 8.5,
    frontSetback: 7.0, leftSetback: 2.5,
    linkZoning: true, zoningType: 'orange', zone: 'other',
    roofVisible: true, roofType: 'gable'   // visual only: does not affect compliance
  };

  /** Category presets (same numbers as the original setBuildingCategory()). */
  const CATEGORY_PRESETS = {
    house: {
      bWidth: 11.0, bDepth: 11.5, height: 7.2,
      frontSetback: 7.5, leftSetback: 3.5, neighborWallType: 'opening'
    },
    townhome: {
      buildingShape: 'straight', unitWidth: 4.5, unitDepth: 9.0, rowUnits: 4, rowGap: 4.0,
      isCornerUnit: true, height: 9.0, leftSetback: 2.0,
      neighborWallType: 'solid', frontSetbackFromRoad: 3.0
    },
    shophouse: {
      buildingShape: 'straight', unitWidth: 4.0, unitDepth: 10.0, rowUnits: 4, rowGap: 4.0,
      isCornerUnit: true, frontPublicRoad: false, shophouseResi: false,
      floorAboveWalk: 15, floorAboveRoad: 30, height: 10.5, leftSetback: 2.0,
      neighborWallType: 'solid', frontSetbackFromRoad: 6.0
    },
    condo: {
      buildingShape: 'U', bWidth: 22.0, bDepth: 22.0,
      height: 24.0, frontSetback: 12.0, leftSetback: 6.0,
      neighborWallType: 'opening', eavesProj: 0.4, hasGutter: true
    }
  };

  /**
   * Minimum setback from the lot line on a road side (Sec. 41), metres.
   * tall = building over 2 storeys or over 8 m, or a townhome / shophouse (Sec. 41 list).
   * Returns 0 where Sec. 41 sets no rule (low building on a road of 6 m or wider).
   * Sec. 41 measures from the road centreline for roads under 10 m and from the road boundary for 10 m and wider;
   * the lot line sits on the road boundary, so the centreline distance is converted by subtracting half the road width.
   */
  function getRoadLotEdgeSetback(rWidth, tall) {
    if (rWidth < 6) return Math.max(0, (tall ? 6.0 : 3.0) - rWidth / 2);
    if (!tall) return 0;
    if (rWidth < 10) return Math.max(0, 6.0 - rWidth / 2);
    if (rWidth <= 20) return rWidth / 10;
    return 2.0;
  }

  /** Round to nearest 0.5 m (the UI's step size). */
  function halfRound(v) {
    return Math.round(v * 2) / 2;
  }

  /**
   * Building footprint geometry for straight / L / U shapes.
   * Returns a 2D polygon (origin at the building's front-left corner, +z = towards the rear)
   * plus the courtyard rectangle for L/U shapes.
   */
  function getBuildingGeometry(s) {
    const { lotWidth, leftSetback, bWidth, bDepth, buildingShape, frontSetback, roadWidth, buildingCategory } = s;
    const frontLotOffset = frontSetback - roadWidth / 2;
    const minX = -lotWidth / 2 + leftSetback;
    const maxZ = -frontLotOffset;
    const minZ = -(frontLotOffset + bDepth);
    const effectiveShape = (buildingCategory === 'house' || buildingCategory === 'condo') ? buildingShape : 'straight';

    if (effectiveShape === 'L' && bWidth >= 4.5 && bDepth >= 4.5) {
      const wingW = Math.max(2.2, Math.min(bWidth * 0.44, bWidth - 2.0));
      const rearD = Math.max(2.2, Math.min(bDepth * 0.44, bDepth - 2.0));
      const frontWingD = bDepth - rearD;
      return {
        shape: 'L', minX, maxZ, minZ, frontLotOffset,
        footprintArea: bWidth * rearD + wingW * frontWingD,
        polygon2D: [[0, 0], [wingW, 0], [wingW, frontWingD], [bWidth, frontWingD], [bWidth, bDepth], [0, bDepth]],
        courtyard: { x: minX + wingW + (bWidth - wingW) / 2, z: maxZ - frontWingD / 2, w: bWidth - wingW, d: frontWingD }
      };
    }
    if (effectiveShape === 'U' && bWidth >= 6.0 && bDepth >= 4.5) {
      const wingW = Math.max(2.0, Math.min(bWidth * 0.30, (bWidth - 2.2) / 2));
      const rearD = Math.max(2.2, Math.min(bDepth * 0.38, bDepth - 2.0));
      const sideWingD = bDepth - rearD;
      return {
        shape: 'U', minX, maxZ, minZ, frontLotOffset,
        footprintArea: bWidth * rearD + 2 * (wingW * sideWingD),
        polygon2D: [[0, 0], [wingW, 0], [wingW, sideWingD], [bWidth - wingW, sideWingD], [bWidth - wingW, 0],
          [bWidth, 0], [bWidth, bDepth], [0, bDepth]],
        courtyard: { x: minX + bWidth / 2, z: maxZ - sideWingD / 2, w: bWidth - 2 * wingW, d: sideWingD }
      };
    }
    return {
      shape: 'straight', minX, maxZ, minZ, frontLotOffset,
      footprintArea: bWidth * bDepth,
      polygon2D: [[0, 0], [bWidth, 0], [bWidth, bDepth], [0, bDepth]],
      courtyard: null
    };
  }

  /**
   * Row buildings (townhome / shophouse) derive their footprint from unit size × count.
   * Returns a shallow copy of state with bWidth/bDepth synced.
   */
  function normalizeState(input) {
    const s = Object.assign({}, DEFAULT_STATE, input);
    if (s.buildingCategory === 'townhome' || s.buildingCategory === 'shophouse') {
      s.bWidth = Number((s.unitWidth * s.rowUnits).toFixed(2));
      s.bDepth = s.unitDepth;
    }
    return s;
  }

  /**
   * Run the full compliance check.
   * @returns {{ isAllValid, rules, metrics, required, flags, geometry }}
   */
  function evaluate(input, lang) {
    const s = normalizeState(input);
    const isEn = lang === 'en';
    const L = (th, en) => (isEn ? en : th);
    const {
      buildingCategory, unitWidth, unitDepth, rowUnits, rowGap, isCornerUnit,
      frontPublicRoad, shophouseResi, floorAboveWalk, floorAboveRoad,
      neighborWallType, gbThick, gbHeight, gbAreaPct, neighborConsent, eavesProj, hasGutter,
      lotWidth, lotDepth, bWidth, bDepth, secLeft, secRight, secRear, secLeftW, secRightW, secRearW, roadWidth, riverWidth,
      hasRiver, hasBridge, height, frontSetback, leftSetback, linkZoning, zoningType
    } = s;

    const isRowType = buildingCategory === 'townhome' || buildingCategory === 'shophouse';
    const isHighRise = buildingCategory === 'condo' && height >= 23.0;
    const frontLotOffset = Number((frontSetback - roadWidth / 2).toFixed(2));
    const rightSetback = Number((lotWidth - leftSetback - bWidth).toFixed(2));
    const rearSetback = Number((lotDepth - frontLotOffset - bDepth).toFixed(2));
    const floors = Math.max(1, Math.floor(height / 3.2));
    // Sec. 41 applies to buildings over 2 storeys or over 8 m, and to townhomes / shophouses (listed types) at any height
    const tallOrListed = floors > 2 || height > 8.0 || isRowType;

    // 1. Front setback ----------------------------------------------------------
    let reqFrontFromLot = 0;
    let reqFrontFromCenter = 6.0;
    let frontRuleText = '';

    // Sec. 41 road-edge distance (same helper as sides and rear), converted to a distance from the road centreline
    const frontRoadEdge = getRoadLotEdgeSetback(roadWidth, tallOrListed);
    const frontRoadText = frontRoadEdge > 0
      ? L(`ตามข้อ 41: ร่นจากเขตทาง ${frontRoadEdge.toFixed(2)} ม. (กึ่งกลางถนน ≥ ${(roadWidth / 2 + frontRoadEdge).toFixed(2)} ม.)`,
        `Sec. 41: ${frontRoadEdge.toFixed(2)}m from road boundary (road centre ≥ ${(roadWidth / 2 + frontRoadEdge).toFixed(2)}m)`)
      : L(`ตามข้อ 41: ถนนกว้าง ${roadWidth} ม. อาคารไม่สูง ไม่มีเกณฑ์ระยะร่นจากถนนในข้อนี้`,
        `Sec. 41: ${roadWidth}m road, low building, no road setback requirement in this section`);

    if (buildingCategory === 'house') {
      reqFrontFromCenter = roadWidth / 2 + frontRoadEdge;
      frontRuleText = L(`บ้านพักอาศัย: ${frontRoadText}`, `Detached House: ${frontRoadText}`);
    } else if (buildingCategory === 'condo') {
      if (isHighRise) {
        reqFrontFromLot = 6.0;
        reqFrontFromCenter = Math.max(10.0, roadWidth / 2 + 6.0);
        frontRuleText = L('อาคารสูง/คอนโด (≥ 23 ม.): ถนนสาธารณะต้องกว้าง ≥ 10.0 ม. และร่นจากเขตที่ดินด้านหน้า ≥ 6.00 ม. (รถดับเพลิงผ่านได้)',
          'High-Rise Condo (≥ 23m): Requires public road ≥ 10.0 m & ≥ 6.00 m setback from plot boundary (fire truck access).');
      } else {
        reqFrontFromCenter = roadWidth / 2 + frontRoadEdge;
        frontRuleText = L(`หอพัก/คอนโด Low-Rise (< 23 ม.): ${frontRoadText}`, `Low-Rise Dorm / Condo (< 23m): ${frontRoadText}`);
      }
    } else if (buildingCategory === 'townhome') {
      reqFrontFromLot = 3.0;
      reqFrontFromCenter = Math.max(6.0, roadWidth / 2 + reqFrontFromLot);
      frontRuleText = L('ทาวน์โฮม/บ้านแถว: ที่ว่างด้านหน้าจากแนวเขตที่ดินต้องไม่น้อยกว่า 3.00 ม.',
        'Townhome / Row House: Front open space from plot boundary must be at least 3.00 m.');
    } else {
      const need12m = (!frontPublicRoad && floors > 3) || floors > 3;
      reqFrontFromLot = need12m ? 12.0 : 6.0;
      reqFrontFromCenter = roadWidth / 2 + reqFrontFromLot;
      frontRuleText = need12m
        ? L('ห้องแถว/ตึกแถว สูงเกิน 3 ชั้น (ไม่ติดถนน): ที่ว่างหน้าอาคารจากแนวเขตที่ดินอย่างน้อย 12.00 ม.',
          'Shophouse > 3 floors (non-public road): Front open space from plot boundary must be ≥ 12.00 m.')
        : L('ห้องแถว/ตึกแถว สูงไม่เกิน 3 ชั้น (ไม่ติดถนน): ที่ว่างหน้าอาคารจากแนวเขตที่ดินอย่างน้อย 6.00 ม.',
          'Shophouse ≤ 3 floors (non-public road): Front open space from plot boundary must be ≥ 6.00 m.');
    }
    const effectiveReqFront = Math.max(reqFrontFromCenter, roadWidth / 2);
    const highRiseRoadOk = !isHighRise || roadWidth >= 10.0;
    const frontValid = frontSetback >= effectiveReqFront && frontLotOffset >= reqFrontFromLot && highRiseRoadOk;

    // 2. Neighbour wall rules & eaves --------------------------------------------
    let reqNeighborWall = 2.0;
    let wallConditionOk = true;
    let wallRuleDetail = '';

    if (neighborWallType === 'opening') {
      reqNeighborWall = height <= 9.0 ? 2.0 : 3.0;
      wallRuleDetail = height <= 9.0
        ? L('ผนังมีช่องเปิด (ประตู/หน้าต่าง/บล็อกช่องลม/ระบายอากาศ) สูง ≤ 9 ม. ร่น ≥ 2.00 ม.',
          'Wall with openings (doors/windows/vents), height ≤ 9m: requires ≥ 2.00 m setback.')
        : L('ผนังมีช่องเปิด สูงเกิน 9 ม. (ไม่เกิน 23 ม.) ต้องเว้นระยะ ≥ 3.00 ม.',
          'Wall with openings, height > 9m (up to 23m): requires ≥ 3.00 m setback.');
    } else if (neighborWallType === 'solid') {
      reqNeighborWall = 0.5;
      wallRuleDetail = L('ผนังทึบ (ไม่มีช่องเปิดเลย) ร่นขั้นต่ำจากแนวเขตที่ดิน ≥ 0.50 ม.',
        'Solid blank wall (no openings): minimum setback from neighbor boundary ≥ 0.50 m.');
    } else if (neighborWallType === 'glassblock') {
      reqNeighborWall = 0.5;
      const gbThickOk = gbThick >= 9.0;
      const gbHeightOk = gbHeight > 1.8;
      const gbAreaOk = gbAreaPct <= 10.0;
      wallConditionOk = gbThickOk && gbHeightOk && gbAreaOk;
      wallRuleDetail = L(
        `ผนังทึบติดบล็อกแก้ว ร่น ≥ 0.50 ม. | เงื่อนไข: หนา ${gbThick}ซม.(≥9) • สูง ${gbHeight.toFixed(2)}ม.(>1.8) • พื้นที่ ${gbAreaPct}%(≤10%)`,
        `Solid wall with glass blocks (≥ 0.50 m) | Thick ${gbThick}cm (≥9) • Height ${gbHeight.toFixed(2)}m (>1.8) • Area ${gbAreaPct}% (≤10%)`);
    } else {
      reqNeighborWall = 0.0;
      wallConditionOk = neighborConsent;
      wallRuleDetail = neighborConsent
        ? L('สร้างชิดเขตที่ดิน (< 0.50 ม.) ได้รับหนังสือยินยอมจากเจ้าของที่ดินข้างเคียงเป็นลายลักษณ์อักษรแล้ว',
          'Zero-lot construction (< 0.50 m): Written consent from adjacent landowner verified.')
        : L('⚠️ สร้างชิดเขตที่ดิน (< 0.50 ม.) โดยไม่มีหนังสือยินยอมจากเจ้าของที่ดินข้างเคียงเป็นลายลักษณ์อักษร!',
          '⚠️ Zero-lot construction (< 0.50 m) WITHOUT written consent from adjacent landowner!');
    }

    const minSideDist = Math.min(leftSetback, rightSetback);
    const eavesToLotDist = Number((minSideDist - eavesProj).toFixed(2));
    const eavesValid = eavesProj === 0 ? true : (eavesToLotDist >= 0.5 && hasGutter);
    // Sec. 43: a building set back under Sec. 41 (road) or Sec. 42 (waterway) needs its lowest eave at least 3.25 m above the sidewalk
    const setbackFromRoadOrWater = tallOrListed || roadWidth < 6 || (secLeft && secLeftW < 6) || (secRight && secRightW < 6)
      || (secRear && secRearW < 6) || (hasRiver && !hasBridge) || (s.riverLeft && !s.bridgeLeft) || (s.riverRight && !s.bridgeRight);
    const eaveHeightOk = !setbackFromRoadOrWater || s.eaveHeight >= 3.25;

    const leftRoadReq = getRoadLotEdgeSetback(secLeftW, tallOrListed);
    const rightRoadReq = getRoadLotEdgeSetback(secRightW, tallOrListed);
    const rearRoadReq = getRoadLotEdgeSetback(secRearW, tallOrListed);
    const leftIsRoad = !!secLeft;
    const rightIsRoad = !!secRight;
    const rearIsRoad = !!secRear;
    // Sec. 50 (openings / solid walls vs. the lot boundary) still applies on a road side, so the road rule is a floor, not a replacement
    let reqLeft = leftIsRoad ? Math.max(leftRoadReq, reqNeighborWall) : reqNeighborWall;
    let reqRight = rightIsRoad ? Math.max(rightRoadReq, reqNeighborWall) : reqNeighborWall;
    // a waterway on a side asks for the same setback as a rear one (Sec. 42): 3 m (< 10 m wide), 6 m; the bridge itself is exempt
    const waterReq = (w, bridge) => (bridge ? 0 : (w < 10 ? 3 : 6));
    if (s.riverLeft) reqLeft = Math.max(reqLeft, waterReq(s.riverLeftW, s.bridgeLeft));
    if (s.riverRight) reqRight = Math.max(reqRight, waterReq(s.riverRightW, s.bridgeRight));
    if (isRowType && isCornerUnit) {
      reqLeft = Math.max(reqLeft, 2.0);
      reqRight = Math.max(reqRight, 2.0);
    }
    if (isHighRise) {
      reqLeft = Math.max(reqLeft, 6.0);
      reqRight = Math.max(reqRight, 6.0);
    }
    const leftValid = leftSetback >= reqLeft;
    const rightValid = rightSetback >= reqRight;
    const sideAndWallValid = leftValid && rightValid && wallConditionOk && eavesValid;

    // 3. Rear setback -----------------------------------------------------------
    let reqRear = reqNeighborWall;
    let rearRuleTitle = L('3. ที่ว่างด้านหลัง / ริมแหล่งน้ำ', '3. Rear Open Space / Waterway Setback');
    let rearRuleText = '';

    if (hasRiver) {
      rearRuleTitle = hasBridge
        ? L('3. ระยะร่นแหล่งน้ำ & สะพาน (ข้อ 42)', '3. Waterway & Bridge Setback (Sec. 42)')
        : L('3. ระยะร่นริมแม่น้ำ/คลอง (ข้อ 42)', '3. River / Canal Setback (Sec. 42)');
      if (hasBridge) {
        reqRear = 0.0;
        rearRuleText = L('สะพานข้ามแหล่งน้ำ: ตัวสะพานไม่ต้องร่นจากเขตแหล่งน้ำ (ข้อ 42)',
          'Bridge over waterway: the bridge structure itself is exempt from the waterway setback (Sec. 42).');
      } else if (riverWidth < 10) {
        reqRear = 3.0;
        rearRuleText = L(`แหล่งน้ำสาธารณะกว้าง ${riverWidth} ม. (< 10 ม.) ร่นจากเขตแหล่งน้ำ ≥ 3.0 ม.`,
          `Public waterway ${riverWidth}m wide (< 10m): requires ≥ 3.0 m setback.`);
      } else {
        reqRear = 6.0;
        rearRuleText = L(`แหล่งน้ำสาธารณะกว้าง ${riverWidth} ม. (≥ 10 ม.) ร่นจากเขตแหล่งน้ำ ≥ 6.0 ม.`,
          `Public waterway ${riverWidth}m wide (≥ 10m): requires ≥ 6.0 m setback.`);
      }
    } else if (isHighRise) {
      reqRear = 6.0;
      rearRuleText = L('อาคารสูง (≥ 23 ม.): กฎกระทรวง ฉ.33 บังคับเว้นที่ว่างโดยรอบอาคารทุกด้านไม่น้อยกว่า 6.00 ม. เพื่อให้รถดับเพลิงเข้าถึง',
        'High-Rise Building (≥ 23m): Requires ≥ 6.00 m clear open space around all sides for fire-truck access.');
    } else if (buildingCategory === 'townhome') {
      reqRear = 2.0;
      rearRuleText = L('ทาวน์โฮม/บ้านแถว: ที่ว่างด้านหลังตลอดความกว้างของคูหา ต้องไม่น้อยกว่า 2.00 ม. (เพื่อระบายอากาศ/หนีไฟ)',
        'Townhome / Row House: Rear open space across full unit width must be ≥ 2.00 m (ventilation & fire escape).');
    } else if (buildingCategory === 'shophouse') {
      reqRear = 3.0;
      rearRuleText = L('อาคารพาณิชย์ (ตึกแถว): ที่ว่างด้านหลังตลอดความกว้างของคูหา ต้องไม่น้อยกว่า 3.00 ม. (เพื่อระบายอากาศ/หนีไฟ)',
        'Shophouse / Commercial Row: Rear open space across full unit width must be ≥ 3.00 m.');
    } else {
      reqRear = reqNeighborWall;
      rearRuleText = L(
        `${buildingCategory === 'condo' ? 'หอพัก/คอนโด Low-Rise' : 'บ้านพักอาศัย'}: ยึดตามระยะผนังทึบ (0.50 ม.) หรือมีช่องเปิด (${height <= 9 ? '2.00' : '3.00'} ม.)`,
        `${buildingCategory === 'condo' ? 'Low-Rise Dorm/Condo' : 'Detached House'}: Follows solid wall (0.50 m) or wall with openings (${height <= 9 ? '2.00' : '3.00'} m).`);
    }
    if (rearIsRoad) reqRear = Math.max(reqRear, rearRoadReq);
    const rearValid = rearSetback >= reqRear;

    // 4. Unit dimensions & continuous row ---------------------------------------
    const totalRowLength = Number((unitWidth * rowUnits).toFixed(2));
    const unitLotSqWah = Number(((unitWidth * lotDepth) / 4).toFixed(1));
    const unitGroundArea = Number((unitWidth * unitDepth).toFixed(1));
    let rowRuleValid = true;
    let rowRuleSummary = '';

    if (buildingCategory === 'townhome') {
      const dimOk = unitWidth >= 4.0 && unitDepth >= 4.0 && unitLotSqWah >= 16.0;
      const lenOk = rowUnits <= 10 && totalRowLength <= 40.0;
      const gapOk = rowGap >= 4.0;
      rowRuleValid = dimOk && lenOk && gapOk;
      rowRuleSummary = L(
        `คูหา ${unitWidth.toFixed(1)}×${unitDepth.toFixed(1)}ม. (${unitLotSqWah} ตร.ว.) | แถว ${rowUnits} คูหา ยาว ${totalRowLength.toFixed(1)}ม. | ช่องว่างระหว่างกลุ่ม ${rowGap.toFixed(1)}ม.`,
        `Unit ${unitWidth.toFixed(1)}×${unitDepth.toFixed(1)}m (${unitLotSqWah} sq.wah) | ${rowUnits} units (${totalRowLength.toFixed(1)}m) | Gap ${rowGap.toFixed(1)}m`);
    } else if (buildingCategory === 'shophouse') {
      const dimOk = unitWidth >= 4.0 && unitDepth >= 4.0 && unitGroundArea >= 30.0;
      const lenOk = rowUnits <= 10 && totalRowLength <= 40.0;
      const gapOk = rowGap >= 4.0;
      const elevOk = floorAboveWalk >= 10 && floorAboveRoad >= 25;
      rowRuleValid = dimOk && lenOk && gapOk && elevOk;
      rowRuleSummary = L(
        `คูหา ${unitWidth.toFixed(1)}×${unitDepth.toFixed(1)}ม. (ชั้นล่าง ${unitGroundArea} ตร.ม.) | พื้นสูง +${floorAboveWalk}/+${floorAboveRoad}ซม. | แถว ${rowUnits} คูหา (${totalRowLength.toFixed(1)}ม.)`,
        `Unit ${unitWidth.toFixed(1)}×${unitDepth.toFixed(1)}m (${unitGroundArea} sq.m.) | Floor +${floorAboveWalk}/+${floorAboveRoad}cm | ${rowUnits} units (${totalRowLength.toFixed(1)}m)`);
    }

    // 5. OSR & FAR ----------------------------------------------------------------
    const geometry = getBuildingGeometry(s);
    const footprintArea = geometry.footprintArea;
    const lotArea = lotWidth * lotDepth;
    const openSpaceArea = Math.max(0, lotArea - footprintArea);
    const openSpaceRatio = (openSpaceArea / lotArea) * 100;
    const totalFloorArea = footprintArea * floors;
    const far = totalFloorArea / lotArea;

    const categoryMinOSR = buildingCategory === 'shophouse' && !shophouseResi ? 10 : 30;
    const zoneSpec = ZONING_SPECS[zoningType];
    const effectiveMinOSR = linkZoning ? Math.max(categoryMinOSR, zoneSpec.minOSR) : categoryMinOSR;
    const farValid = !linkZoning || far <= zoneSpec.maxFAR;
    const osrValid = openSpaceRatio >= effectiveMinOSR;

    // 6. Height envelope ----------------------------------------------------------
    const horizontalDistToOppRoad = roadWidth / 2 + frontSetback;
    const maxAllowedHeight = horizontalDistToOppRoad * 2;
    const heightValid = height <= maxAllowedHeight;

    const isAllValid = frontValid && sideAndWallValid && rearValid && rowRuleValid && heightValid && farValid && osrValid && eaveHeightOk;

    const catNames = isEn
      ? { house: '2-Story House', townhome: 'Townhome / Row House', shophouse: 'Shophouse / Commercial Row',
          condo: isHighRise ? 'High-Rise Condo (≥23m)' : 'Dormitory / Low-Rise Condo' }
      : { house: 'บ้านพักอาศัย', townhome: 'ทาวน์โฮม/บ้านแถว', shophouse: 'อาคารพาณิชย์/ตึกแถว',
          condo: isHighRise ? 'คอนโดมิเนียม/อาคารสูง (≥23ม.)' : 'หอพัก/คอนโด Low-Rise' };
    const catName = catNames[buildingCategory];

    const rules = [
      {
        id: 'front',
        title: L(`1. ที่ว่างด้านหน้า (${catName})`, `1. Front Open Space (${catName})`),
        pass: frontValid,
        current: L(`จากเขตที่ดิน ${frontLotOffset.toFixed(1)} ม. (จากกึ่งกลางถนน ${frontSetback.toFixed(1)} ม.)`,
          `From lot ${frontLotOffset.toFixed(1)}m (road center ${frontSetback.toFixed(1)}m)`),
        required: buildingCategory === 'house' || (buildingCategory === 'condo' && !isHighRise)
          ? L(`กึ่งกลางถนน ≥ ${effectiveReqFront.toFixed(1)} ม.`, `Road center ≥ ${effectiveReqFront.toFixed(1)}m`)
          : L(`จากเขตที่ดิน ≥ ${reqFrontFromLot.toFixed(1)} ม.${isHighRise ? ' & ถนน ≥ 10ม.' : ''}`,
            `From lot ≥ ${reqFrontFromLot.toFixed(1)}m${isHighRise ? ' & Road ≥ 10m' : ''}`),
        desc: frontRuleText
      },
      {
        id: 'sides',
        title: L('2. กฎเหล็กผนังติดเขตที่ดิน & ชายคา/กันสาด', '2. Neighbor Wall & Eaves Rules'),
        pass: sideAndWallValid,
        current: L(`ซ้าย ${leftSetback.toFixed(1)}ม. / ขวา ${rightSetback.toFixed(1)}ม. | ชายคาห่างเขต ${eavesToLotDist.toFixed(2)}ม.`,
          `L ${leftSetback.toFixed(1)}m / R ${rightSetback.toFixed(1)}m | Eaves ${eavesToLotDist.toFixed(2)}m`),
        required: L(`ซ้าย≥${reqLeft.toFixed(2)}ม. ขวา≥${reqRight.toFixed(2)}ม. | ชายคา≥0.50ม.`,
          `L≥${reqLeft.toFixed(2)}m R≥${reqRight.toFixed(2)}m | Eaves≥0.50m`),
        desc: L(
          `${wallRuleDetail} • ชายคา/กันสาด/ระแนงต้องห่างเขต ≥ 0.50 ม. (${hasGutter ? 'มีรางน้ำฝนแล้ว' : '⚠️ ไม่มีรางน้ำฝน'})`,
          `${wallRuleDetail} • Eaves/canopy must stay ≥ 0.50 m from lot line (${hasGutter ? 'Gutter installed' : '⚠️ Missing rain gutter'}).`)
      },
      {
        id: 'rear',
        title: rearRuleTitle,
        pass: rearValid,
        current: L(`${rearSetback.toFixed(1)} ม. (${hasRiver ? 'ถึงเขตแหล่งน้ำ' : 'ตลอดความกว้าง'})`,
          `${rearSetback.toFixed(1)} m (${hasRiver ? 'to waterway' : 'full width'})`),
        required: `≥ ${reqRear.toFixed(2)} ${L('ม.', 'm')}`,
        desc: rearRuleText
      },
      {
        id: 'osr',
        title: L(`4. เกณฑ์พื้นที่ว่างรวม OSR (${catName})`, `4. Total Open Space OSR (${catName})`),
        pass: osrValid && farValid,
        current: L(`OSR ${openSpaceRatio.toFixed(1)}% (ที่ว่าง ${Math.round(openSpaceArea)} ตร.ม.) | FAR ${far.toFixed(2)}`,
          `OSR ${openSpaceRatio.toFixed(1)}% (${Math.round(openSpaceArea)} sq.m.) | FAR ${far.toFixed(2)}`),
        required: `OSR ≥ ${effectiveMinOSR}%${linkZoning ? ` | FAR ≤ ${zoneSpec.maxFAR.toFixed(1)}` : ''}`,
        desc: buildingCategory === 'shophouse'
          ? (shophouseResi
            ? L('ห้องแถว/ตึกแถว ใช้อยู่อาศัยร่วมด้วย บังคับที่ว่างรวมไม่น้อยกว่า 30%',
              'Shophouse with residential use requires total open space ≥ 30% of lot area.')
            : L('ห้องแถว/ตึกแถว ต้องมีที่ว่างรวมไม่น้อยกว่า 10% ของพื้นที่ดิน',
              'Commercial shophouse requires total open space ≥ 10% of sub-lot area.'))
          : L('บ้านพักอาศัย ทาวน์โฮม และคอนโด/หอพัก ต้องมีที่ว่างรวมไม่น้อยกว่า 30% ของพื้นที่ดิน',
            'Detached houses, townhomes, and condos require total open space ≥ 30% of lot area.')
      },
      {
        id: 'height',
        title: L('5. ความสูงอาคารสูงสุด (ข้อ 44)', '5. Max Building Height Envelope (Sec. 44)'),
        pass: heightValid,
        current: L(`${height.toFixed(1)} ม. (${floors} ชั้น)`, `${height.toFixed(1)} m (${floors} floors)`),
        required: `≤ ${maxAllowedHeight.toFixed(1)} ${L('ม.', 'm')}`,
        desc: L(
          `ความสูงอาคารต้องไม่เกิน 2 เท่าของระยะราบ (${horizontalDistToOppRoad.toFixed(1)} ม.) จากอาคารถึงเขตถนนสาธารณะฝั่งตรงข้าม`,
          `Building height must not exceed 2× the horizontal distance (${horizontalDistToOppRoad.toFixed(1)}m) to the opposite side of the public road.`)
      },
      {
        id: 'eave43',
        title: L('5b. ความสูงชายคาจากทางเท้า (ข้อ 43)', '5b. Eave Height Above Sidewalk (Sec. 43)'),
        pass: eaveHeightOk,
        current: L(`${s.eaveHeight.toFixed(2)} ม.`, `${s.eaveHeight.toFixed(2)} m`),
        required: setbackFromRoadOrWater ? `≥ 3.25 ${L('ม.', 'm')}` : L('ไม่บังคับ (ไม่อยู่ในข้อ 41–42)', 'Not required (outside Sec. 41–42)'),
        desc: L('อาคารที่ต้องร่นตามข้อ 41 หรือข้อ 42 ส่วนต่ำสุดของชายคาหรือส่วนยื่นสถาปัตยกรรมต้องสูงจากทางเท้าไม่น้อยกว่า 3.25 ม. (ไม่นับส่วนตกแต่งที่ยื่นไม่เกิน 0.50 ม.)',
          'Buildings set back under Sec. 41 or 42: the lowest eave or architectural projection must be at least 3.25 m above the sidewalk (decorations projecting up to 0.50 m excluded).')
      }
    ];
    if (s.zone === 'bkk') {
      rules.push({
        id: 'zone',
        info: true,
        pass: true,
        title: L('ข้อบัญญัติกรุงเทพมหานคร', 'Bangkok ordinances'),
        current: L('กรุงเทพมหานคร', 'Bangkok'),
        required: L('ข้อบัญญัติ กทม. อาจกำหนดต่างจากกฎกระทรวง 55 ตรวจไม่ได้ในแอป', 'Bangkok ordinances may differ from MR 55; not checked in this app'),
        desc: L('ตรวจเกณฑ์ข้อบัญญัติท้องถิ่นของ กทม. กับหน่วยงานเขตก่อนยื่นขออนุญาต ผลในแอปใช้กฎกระทรวง ฉบับที่ 55 เท่านั้น',
          'Check the Bangkok local ordinances with the district office before filing. This app applies Ministerial Reg. 55 only.')
      });
    }
    if (s.infra && s.infra.length) {
      rules.push({
        id: 'infra',
        info: true,
        pass: true,
        title: L('7. ทางรถไฟ / ทางด่วน / รถไฟฟ้า (ไม่มีในกฎกระทรวง ฉบับที่ 55)', '7. Railway / Expressway / Elevated Rail (not in Ministerial Reg. 55)'),
        current: L(`${s.infra.length} รายการ`, `${s.infra.length} item(s)`),
        required: L('ไม่มีเกณฑ์ระยะร่นในกฎกระทรวงนี้ ตรวจไม่ได้', 'No setback rule in this regulation; not checked'),
        desc: L('กฎกระทรวง ฉบับที่ 55 ไม่กำหนดระยะร่นจากทางรถไฟ ทางด่วน หรือรถไฟฟ้า ระยะเหล่านี้ต้องตรวจตามกฎหมายหรือหน่วยงานที่เกี่ยวข้อง',
          'Ministerial Reg. 55 sets no setback from railways, expressways or elevated rail. Check those under the relevant law or agency.')
      });
    }

    if (isRowType) {
      rules.push({
        id: 'row',
        title: buildingCategory === 'shophouse'
          ? L('6. ขนาดคูหา ระดับพื้น (+10/+25ซม.) & แถวต่อเนื่อง (≤10 คูหา/40ม.)', '6. Unit Size, Floor Level (+10/+25cm) & Row Limit (≤10 units / 40m)')
          : L('6. ขนาดคูหา แถวต่อเนื่อง (≤10 คูหา/40ม.) & ช่องว่าง (≥4ม.)', '6. Unit Size, Row Limit (≤10 units / 40m) & Group Gap (≥4m)'),
        pass: rowRuleValid,
        current: rowRuleSummary,
        required: buildingCategory === 'townhome'
          ? L('กว้าง≥4ม. ลึก≥4ม. ≥16ตร.ว. | ≤10คูหา/40ม. | เว้น≥4ม.', 'W≥4m D≥4m ≥16sq.w | ≤10units/40m | Gap≥4m')
          : L('กว้าง≥4ม. ลึก≥4ม. ≥30ตร.ม. | พื้นสูง≥10/25ซม. | ≤10คูหา/40ม.', 'W≥4m D≥4m ≥30sq.m | Elev≥10/25cm | ≤10units'),
        desc: buildingCategory === 'shophouse'
          ? L('กว้าง ≥ 4 ม. ลึก ≥ 4 ม. พื้นชั้นล่างสูงจากทางเท้า ≥ 10 ซม. และสูงจากกลางถนน ≥ 25 ซม. สร้างต่อเนื่องได้ ≤ 10 คูหา หรือยาว ≤ 40 ม. (เว้นช่องว่าง ≥ 4.00 ม.)',
            'Width ≥ 4m, Depth ≥ 4m, ground floor ≥ 10cm above sidewalk & ≥ 25cm above road center. Max 10 units or 40m continuous row (≥ 4.00m gap between groups).')
          : L('สร้างต่อเนื่องได้ไม่เกิน 10 คูหา หรือยาวรวมไม่เกิน 40 ม. เมื่อครบต้องเว้นที่ว่างระหว่างกลุ่มอาคารไม่น้อยกว่า 4.00 ม.',
            'Continuous row limited to ≤ 10 units or ≤ 40m total length; must leave ≥ 4.00m open gap between building groups.')
      });
    }

    return {
      isAllValid,
      categoryName: catName,
      rules,
      metrics: {
        floors, lotArea, footprintArea, openSpaceArea, openSpaceRatio, far,
        totalFloorArea, frontLotOffset, rightSetback, rearSetback, eavesToLotDist,
        horizontalDistToOppRoad, maxAllowedHeight, effectiveMinOSR,
        maxAllowedFAR: linkZoning ? zoneSpec.maxFAR : null
      },
      required: { reqFrontFromCenter: effectiveReqFront, reqFrontFromLot, reqLeft, reqRight, reqRear, reqNeighborWall },
      flags: { frontValid, sideAndWallValid, rearValid, rowRuleValid, heightValid, farValid, osrValid, isHighRise },
      geometry,
      state: s
    };
  }

  /**
   * "Fit to legal" — returns the building dimensions that satisfy the current setbacks.
   * Pure: returns a patch object to merge into state, does not mutate.
   */
  function fitBuildingToLegal(input, lang) {
    const s = normalizeState(input);
    const result = evaluate(s, lang);
    const { reqFrontFromCenter, reqLeft, reqRight, reqRear } = result.required;
    const targetFront = Math.max(reqFrontFromCenter, s.roadWidth / 2);
    const frontOff = Math.max(0, targetFront - s.roadWidth / 2);
    const patch = {
      frontSetback: halfRound(targetFront),
      leftSetback: halfRound(reqLeft)
    };
    if (s.buildingCategory === 'house' || s.buildingCategory === 'condo') {
      patch.bWidth = Math.max(3, Math.floor((s.lotWidth - reqLeft - reqRight) * 2) / 2);
      patch.bDepth = Math.max(3, Math.floor((s.lotDepth - frontOff - reqRear) * 2) / 2);
    } else {
      patch.rowUnits = Math.min(10, Math.max(1, Math.floor((s.lotWidth - reqLeft - reqRight) / s.unitWidth)));
      patch.unitDepth = Math.max(4.0, Math.floor((s.lotDepth - frontOff - reqRear) * 2) / 2);
    }
    return patch;
  }

  /** Centre the building on the lot, both across and front-to-back. Returns a state patch. */
  function centerBuilding(input) {
    const s = normalizeState(input);
    // exact centre (to 2 dp, not the 0.5 m grid) so the building sits dead-centre on the lot
    const cents = v => Math.round(v * 100) / 100;
    return {
      leftSetback: Math.max(0, cents((s.lotWidth - s.bWidth) / 2)),
      frontSetback: Math.max(s.roadWidth / 2, cents(s.roadWidth / 2 + (s.lotDepth - s.bDepth) / 2))
    };
  }

  /** Apply a category preset on top of the current state. Returns a full new state. */
  function applyCategoryPreset(input, category) {
    const base = Object.assign({}, DEFAULT_STATE, input);
    const preset = CATEGORY_PRESETS[category] || {};
    const next = Object.assign({}, base, preset, { buildingCategory: category });
    if (preset.frontSetbackFromRoad !== undefined) {
      next.frontSetback = base.roadWidth / 2 + preset.frontSetbackFromRoad;
      delete next.frontSetbackFromRoad;
    }
    // The lot, roads and zoning are the site, not the building type: a preset never changes them.
    // The building is fitted into the existing lot instead.
    const lotW = base.lotWidth, lotD = base.lotDepth;
    if (category === 'townhome' || category === 'shophouse') {
      next.rowUnits = Math.max(1, Math.min(next.rowUnits, Math.floor((lotW - 4.0) / next.unitWidth)));
      next.bWidth = next.unitWidth * next.rowUnits;
      next.bDepth = Math.min(next.unitDepth, Math.max(4, lotD - (next.frontSetback - base.roadWidth / 2) - 2));
      next.unitDepth = next.bDepth;
    } else {
      next.buildingShape = preset.buildingShape || input.buildingShape;
      next.bWidth = Math.min(next.bWidth, Math.max(5, lotW - 2 * next.leftSetback));
      next.bDepth = Math.min(next.bDepth, Math.max(5, lotD - Math.max(0, next.frontSetback - base.roadWidth / 2) - 2));
    }
    // Every building type starts at the middle of the lot; the user nudges it from there.
    return Object.assign(next, centerBuilding(next));
  }


  /**
   * Solar heat received by a wall whose outward normal is n = [x, y, z] (scene frame: +x east, +y up, -z north),
   * summed over the sun's path from 06:00 to 18:00 for a declination (season). Half-hour steps; returns hour-weighted sum.
   */
  function wallHeat(n, declDeg) {
    const D2R = Math.PI / 180;
    let sum = 0;
    for (let hr = 6; hr <= 18; hr += 0.5) {
      const sp = sunPosition(hr, declDeg);
      if (sp.alt <= 0) continue;
      const a = sp.alt * D2R, z = sp.az * D2R;
      const d = n[0] * Math.sin(z) * Math.cos(a) + n[1] * Math.sin(a) - n[2] * Math.cos(z) * Math.cos(a);
      if (d > 0) sum += d * 0.5;
    }
    return sum;
  }

  /** Heat (0..1) -> colour along blue (cool) → amber → red (hot). */
  function heatColor(h) {
    const stops = [[0, [59, 130, 246]], [0.5, [250, 204, 21]], [1, [220, 38, 38]]];
    const t = Math.max(0, Math.min(1, h));
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const [a, ca] = stops[i - 1], [b, cb] = stops[i], k = (t - a) / (b - a);
        return ca.map((v, j) => (v + (cb[j] - v) * k) / 255);
      }
    }
    return stops[stops.length - 1][1].map(v => v / 255);
  }

  /** Sun position for a latitude (default Bangkok 13.75N). Azimuth clockwise from north, degrees. */
  function sunPosition(hour, declDeg, latDeg) {
    const d = Math.PI / 180, lat = (latDeg == null ? 13.75 : latDeg) * d, dec = declDeg * d, H = 15 * (hour - 12) * d;
    const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H);
    const east = -Math.cos(dec) * Math.sin(H);
    const north = Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(H);
    return { alt: Math.asin(sinAlt) / d, az: ((Math.atan2(east, north) / d) + 360) % 360 };
  }


  /** Linear infrastructure kinds: default width (m), deck height (m), traffic noise at 10 m (dB), label. */
  const INFRA_KINDS = {
    rail:       { w: 10, h: 0,  noise: 74, th: 'ทางรถไฟ', en: 'Railway' },
    expressway: { w: 18, h: 9,  noise: 78, th: 'ทางด่วน', en: 'Expressway' },
    skytrain:   { w: 9,  h: 11, noise: 68, th: 'รถไฟฟ้า', en: 'Elevated rail' }
  };
  const INFRA_SIDES = ['front', 'frontRoad', 'left', 'right', 'rear'];

  /** Distance from the lot line to the outer edge of roads + waterways on each side (m). */
  function sideEdges(state) {
    return {
      left: (state.secLeft ? (state.secLeftW || 6) : 0) + (state.riverLeft ? (state.riverLeftW || 8) : 0),
      right: (state.secRight ? (state.secRightW || 6) : 0) + (state.riverRight ? (state.riverRightW || 8) : 0),
      rear: (state.secRear ? (state.secRearW || 6) : 0) + (state.hasRiver ? (state.riverWidth || 12) : 0),
      front: state.roadWidth
    };
  }

  /**
   * Where an infrastructure item sits, in plan coordinates (x from lot left, y from the front lot line, road at y < 0).
   * Returns { vertical: runs along y, pos: centre x (vertical) or y (horizontal), w, h, lo, hi (outer extent from the lot) }.
   */
  function infraPlacement(state, it) {
    const k = INFRA_KINDS[it.k] || INFRA_KINDS.rail;
    const w = it.w || k.w, gap = it.gap == null ? 6 : it.gap, e = sideEdges(state);
    const W = state.lotWidth, D = state.lotDepth, RW = state.roadWidth;
    if (it.side === 'left') return { vertical: true, pos: -(e.left + gap + w / 2), w, h: k.h, reach: e.left + gap + w };
    if (it.side === 'right') return { vertical: true, pos: W + e.right + gap + w / 2, w, h: k.h, reach: e.right + gap + w };
    if (it.side === 'rear') return { vertical: false, pos: D + e.rear + gap + w / 2, w, h: k.h, reach: e.rear + gap + w };
    if (it.side === 'frontRoad') return { vertical: false, pos: -RW / 2, w, h: Math.max(k.h, 6), reach: RW };
    return { vertical: false, pos: -(RW + gap + w / 2), w, h: k.h, reach: RW + gap + w };      // front: across the main road
  }

  /** How far each side's built-up edge extends once infrastructure is counted (used to place neighbours and fit the view). */
  function sideReach(state) {
    const r = sideEdges(state);
    (state.infra || []).forEach(it => {
      const pl = infraPlacement(state, it);
      const key = it.side === 'frontRoad' ? null : (it.side || 'front');
      if (key && pl.reach > r[key]) r[key] = pl.reach;
    });
    return r;
  }

  /** Fields that describe the site (and view), not the building type; kept when a building type is chosen. */
  const SITE_KEYS = ['lotWidth', 'lotDepth', 'roadWidth', 'secLeft', 'secLeftW', 'secRight', 'secRightW', 'secRear', 'secRearW',
    'hasRiver', 'riverWidth', 'hasBridge', 'riverLeft', 'riverLeftW', 'bridgeLeft', 'riverRight', 'riverRightW', 'bridgeRight', 'infra', 'siteBearing', 'zoningType', 'zone', 'linkZoning', 'hasNeighbors', 'showContext', 'ctx',
    'showSun', 'showWind', 'windFlow', 'showHeat', 'showNoise', 'sunHour', 'sunDecl', 'windBearing', 'noiseMain', 'noiseSec',
    'showBuilding', 'showDims', 'roofVisible', 'roofType', 'bldgBearing'];

  /** Seeded PRNG so the auto context is stable. */
  function mulberry(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Auto-generated context in PLAN coordinates (x from lot left, y from the front lot line, road at y < 0).
   * Items: { id, g:'neighbor'|'context', k:'b'|'t', x, y (centre), w, d, h (buildings), s (tree scale), c (colour index) }.
   * Depends only on the lot and roads, never on the main building, so neighbours stay put when it moves.
   */
  function defaultContext(state) {
    const W = state.lotWidth, D = state.lotDepth, RW = state.roadWidth;
    const reach = sideReach(state);
    const offL = reach.left, offR = reach.right, offRe = reach.rear, offFront = reach.front;
    const items = [];
    let n = 0;
    const add = (o) => { items.push(Object.assign({ id: 'c' + (++n) }, o)); };
    const rand = mulberry(20251125);
    const nW = Math.min(W * 0.9, 12), nD = Math.min(D * 0.8, 13);
    const y0 = Math.max(0, Math.min(6, D - nD));
    [-1, 1].forEach(side => {
      const h = rand() > 0.5 ? 7.2 : 10.4;
      const x = side < 0 ? -offL - 2 - nW / 2 : W + offR + 2 + nW / 2;
      add({ g: 'neighbor', k: 'b', x, y: y0 + nD / 2, w: nW, d: nD, h, c: Math.floor(rand() * 5) });
      add({ g: 'neighbor', k: 't', x: x + side * (nW / 2 + 1.5), y: D - 2.5, s: 1.0, c: Math.floor(rand() * 4) });
    });
    if (!(state.hasRiver && state.riverWidth > 0) && !(state.infra || []).some(i => i.side === 'rear')) {
      add({ g: 'neighbor', k: 'b', x: W / 2, y: D + offRe + 6, w: nW + 4, d: 8, h: 7.2, c: Math.floor(rand() * 5) });
    }
    const r2 = mulberry(4242);
    for (let i = -6; i <= 6; i++) {
      const x = W / 2 + i * 17 + (r2() - 0.5) * 4;
      const bw = 10 + r2() * 4, bd = 10 + r2() * 4, h = 4 + r2() * 9;
      add({ g: 'context', k: 'b', x, y: -offFront - 5 - bd / 2, w: bw, d: bd, h, c: Math.floor(r2() * 5) });
      if (r2() > 0.35) {
        const h2 = 8 + r2() * 12;
        add({ g: 'context', k: 'b', x: x + 4, y: -offFront - 5 - bd - 8, w: bw * 0.8, d: bd * 0.8, h: h2, c: Math.floor(r2() * 5) });
      }
    }
    for (let x = -70; x <= 70; x += 9) {
      add({ g: 'context', k: 't', x: W / 2 + x + (r2() - 0.5) * 2, y: -RW - 1.4, s: 0.9 + r2() * 0.3, c: Math.floor(r2() * 4) });
    }
    return items;
  }

  /** Traffic noise at a plan point (dB(A)): line sources, -10 log10(d/10 m), energy-summed over roads. */
  function noiseAt(state, x, y) {
    const W = state.lotWidth, D = state.lotDepth, RW = state.roadWidth;
    const src = [[state.noiseMain, Math.abs(y + RW / 2)]];
    if (state.secLeft) src.push([state.noiseSec, Math.abs(x + (state.secLeftW || 6) / 2)]);
    if (state.secRight) src.push([state.noiseSec, Math.abs(x - W - (state.secRightW || 6) / 2)]);
    if (state.secRear) src.push([state.noiseSec, Math.abs(y - D - (state.secRearW || 6) / 2)]);
    (state.infra || []).forEach(it => {
      const pl = infraPlacement(state, it), k = INFRA_KINDS[it.k] || INFRA_KINDS.rail;
      if (it.side === 'frontRoad') return;                      // already counted with the main road
      src.push([k.noise, Math.abs((pl.vertical ? x : y) - pl.pos)]);
    });
    let e = 0;
    src.forEach(([L, d]) => { e += Math.pow(10, (L - 10 * Math.log10(Math.max(d, 3) / 10)) / 10); });
    return Math.round(10 * Math.log10(e));
  }

  /** Key readings (lot edges and building faces) from plan coordinates. */
  function noiseSummary(state, result) {
    const W = state.lotWidth, D = state.lotDepth;
    const g = result.geometry, m = result.metrics;
    const bx0 = g.minX + W / 2, by0 = m.frontLotOffset, bw = state.bWidth, bd = state.bDepth;
    const at = (x, y) => noiseAt(state, x, y);
    return {
      lotFront: at(W / 2, 0), lotRear: at(W / 2, D),
      bldgFront: at(bx0 + bw / 2, by0), bldgRear: at(bx0 + bw / 2, by0 + bd),
      bldgLeft: at(bx0, by0 + bd / 2), bldgRight: at(bx0 + bw, by0 + bd / 2),
      points: {
        lotFront: [W / 2, 0], bldgFront: [bx0 + bw / 2, by0], bldgRear: [bx0 + bw / 2, by0 + bd],
        bldgLeft: [bx0, by0 + bd / 2], bldgRight: [bx0 + bw, by0 + bd / 2], lotRear: [W / 2, D]
      }
    };
  }

  /** dB -> colour (green quiet … red loud). */
  function noiseColor(db) {
    const stops = [[45, [34, 197, 94]], [55, [163, 230, 53]], [62, [250, 204, 21]], [68, [249, 115, 22]], [74, [220, 38, 38]], [82, [127, 29, 29]]];
    if (db <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (db <= stops[i][0]) {
        const [a, ca] = stops[i - 1], [b, cb] = stops[i], t = (db - a) / (b - a);
        return ca.map((v, k) => Math.round(v + (cb[k] - v) * t));
      }
    }
    return stops[stops.length - 1][1];
  }

  /** 16-direction wind rose (values 0..1) peaking at the prevailing wind-from bearing. */
  function windRose(prevailing) {
    const out = [];
    for (let i = 0; i < 16; i++) {
      const a = i * 22.5;
      let dlt = Math.abs(a - prevailing) % 360; if (dlt > 180) dlt = 360 - dlt;
      const v = 0.18 + 0.82 * Math.exp(-(dlt * dlt) / (2 * 40 * 40)) + 0.16 * Math.exp(-(Math.pow(dlt - 120, 2)) / (2 * 25 * 25));
      out.push(Math.min(1, v));
    }
    return out;
  }

  const api = {
    sunPosition, windRose, defaultContext, noiseAt, noiseSummary, noiseColor,
    DEFAULT_STATE, CATEGORY_PRESETS, ZONING_SPECS, SITE_KEYS,
    getRoadLotEdgeSetback, getBuildingGeometry, normalizeState,
    evaluate, wallHeat, heatColor, INFRA_KINDS, INFRA_SIDES, sideEdges, infraPlacement, sideReach, fitBuildingToLegal, centerBuilding, applyCategoryPreset
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ArchLaw = api;
})(typeof window !== 'undefined' ? window : globalThis);

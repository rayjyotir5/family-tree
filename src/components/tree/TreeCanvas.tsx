'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useFamilyTree } from '@/contexts/FamilyTreeContext';
import type { Individual } from '@/lib/types';

interface TreeCanvasProps {
  onPersonSelect?: (personId: string) => void;
  selectedPersonId?: string;
}

interface Position { x: number; y: number; }

// Layout constants - MyHeritage style
const CARD_W = 120;
const CARD_H = 90;
const H_SPACE = 40;  // Horizontal space between family units
const V_SPACE = 120; // Vertical space between generations
const COUPLE_GAP = 12; // Gap between spouses

export function TreeCanvas({ onPersonSelect, selectedPersonId }: TreeCanvasProps) {
  const { rootPersonId, setRootPersonId, getIndividual, getFamily, data } = useFamilyTree();
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState<Position>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 });
  const [maxGen, setMaxGen] = useState(3);
  const containerRef = useRef<HTMLDivElement>(null);
  const [initialized, setInitialized] = useState(false);

  const rootPerson = getIndividual(rootPersonId);

  // Build tree data
  const { nodes, lines, bounds } = useMemo(() => {
    if (!rootPerson) return { nodes: [], lines: [], bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };

    const nodes: { id: string; x: number; y: number; person: Individual }[] = [];
    const lines: { x1: number; y1: number; x2: number; y2: number; color: string }[] = [];
    const placed = new Set<string>();

    // Helpers
    const getParentIds = (pid: string): [string | null, string | null] => {
      const p = getIndividual(pid);
      if (!p?.familyAsChild) return [null, null];
      const f = getFamily(p.familyAsChild);
      return f ? [f.husband || null, f.wife || null] : [null, null];
    };

    const getSpouseId = (pid: string): string | null => {
      const p = getIndividual(pid);
      if (!p) return null;
      for (const fid of p.familyAsSpouse) {
        const f = getFamily(fid);
        if (f) {
          const sid = f.husband === pid ? f.wife : f.husband;
          if (sid) return sid;
        }
      }
      return null;
    };

    const getChildIds = (pid: string): string[] => {
      const p = getIndividual(pid);
      if (!p) return [];
      const kids: string[] = [];
      for (const fid of p.familyAsSpouse) {
        const f = getFamily(fid);
        if (f) f.children.forEach(c => { if (!kids.includes(c)) kids.push(c); });
      }
      return kids;
    };

    const getSiblingIds = (pid: string): string[] => {
      const p = getIndividual(pid);
      if (!p?.familyAsChild) return [];
      const f = getFamily(p.familyAsChild);
      return f ? f.children.filter(c => c !== pid) : [];
    };

    // Calculate width of a family unit (person + spouse + all descendants)
    const calcUnitWidth = (pid: string, depth: number, memo: Map<string, number>): number => {
      const key = `${pid}-${depth}`;
      if (memo.has(key)) return memo.get(key)!;
      if (depth > maxGen) { memo.set(key, CARD_W); return CARD_W; }

      const spouse = getSpouseId(pid);
      const selfWidth = spouse ? CARD_W * 2 + COUPLE_GAP : CARD_W;
      const children = getChildIds(pid);

      if (children.length === 0) {
        memo.set(key, selfWidth);
        return selfWidth;
      }

      let childrenWidth = 0;
      children.forEach(cid => {
        childrenWidth += calcUnitWidth(cid, depth + 1, memo);
      });
      childrenWidth += (children.length - 1) * H_SPACE;

      const width = Math.max(selfWidth, childrenWidth);
      memo.set(key, width);
      return width;
    };

    // Place a person
    const place = (id: string, x: number, y: number) => {
      if (placed.has(id)) return false;
      const person = getIndividual(id);
      if (!person) return false;
      placed.add(id);
      nodes.push({ id, x, y, person });
      return true;
    };

    // Draw line
    const line = (x1: number, y1: number, x2: number, y2: number, isSpouse = false) => {
      lines.push({ x1, y1, x2, y2, color: isSpouse ? '#f97316' : '#9ca3af' });
    };

    // Place a family unit and return its center X
    const placeUnit = (pid: string, centerX: number, y: number, depth: number, memo: Map<string, number>): number => {
      if (depth > maxGen) return centerX;

      const spouse = getSpouseId(pid);
      const hasSpouse = spouse && !placed.has(spouse);

      if (hasSpouse) {
        const px = centerX - CARD_W - COUPLE_GAP / 2;
        const sx = centerX + COUPLE_GAP / 2;
        place(pid, px, y);
        place(spouse!, sx, y);
        // Spouse connector
        line(px + CARD_W, y + CARD_H / 2, sx, y + CARD_H / 2, true);
      } else {
        place(pid, centerX - CARD_W / 2, y);
      }

      // Place children
      const children = getChildIds(pid);
      if (children.length > 0 && depth < maxGen) {
        const childY = y + V_SPACE;

        // Calculate total children width
        let totalWidth = 0;
        const childWidths: number[] = [];
        children.forEach(cid => {
          const w = calcUnitWidth(cid, depth + 1, memo);
          childWidths.push(w);
          totalWidth += w;
        });
        totalWidth += (children.length - 1) * H_SPACE;

        // Place children centered under parent
        let startX = centerX - totalWidth / 2;
        const childCenters: number[] = [];

        children.forEach((cid, i) => {
          const childCenterX = startX + childWidths[i] / 2;
          childCenters.push(childCenterX);
          placeUnit(cid, childCenterX, childY, depth + 1, memo);
          startX += childWidths[i] + H_SPACE;
        });

        // Draw connections
        const parentBottom = y + CARD_H;
        const connY = y + CARD_H + 25;

        // Vertical from parent
        line(centerX, parentBottom, centerX, connY);

        // Horizontal bar if multiple children
        if (childCenters.length > 1) {
          line(childCenters[0], connY, childCenters[childCenters.length - 1], connY);
        }

        // Drops to each child
        childCenters.forEach(cx => {
          line(cx, connY, cx, childY);
        });
      }

      return centerX;
    };

    const memo = new Map<string, number>();

    // LEVEL 0: Root level - Root + Siblings + Cousins
    // LEVEL -1: Parents + Aunts/Uncles
    // LEVEL -2: Grandparents
    // LEVEL +1: Children + Nieces/Nephews

    const [fatherId, motherId] = getParentIds(rootPersonId);
    const rootSiblings = getSiblingIds(rootPersonId);

    // Get aunts/uncles (parent's siblings) and their children (cousins)
    const fatherSiblings = fatherId ? getSiblingIds(fatherId) : [];
    const motherSiblings = motherId ? getSiblingIds(motherId) : [];

    // Calculate widths for everyone at root level
    // Root level includes: cousins from father's side, root+siblings, cousins from mother's side

    // Father's side cousins
    let fatherSideWidth = 0;
    const fatherSideUnits: { id: string; width: number; isAuntUncle: boolean }[] = [];
    fatherSiblings.forEach(auntUncleId => {
      const children = getChildIds(auntUncleId);
      children.forEach(cousinId => {
        const w = calcUnitWidth(cousinId, 1, memo);
        fatherSideUnits.push({ id: cousinId, width: w, isAuntUncle: false });
        fatherSideWidth += w + H_SPACE;
      });
    });

    // Root + siblings
    let rootSideWidth = calcUnitWidth(rootPersonId, 1, memo) + H_SPACE;
    const rootSideUnits: { id: string; width: number }[] = [{ id: rootPersonId, width: calcUnitWidth(rootPersonId, 1, memo) }];
    rootSiblings.forEach(sibId => {
      const w = calcUnitWidth(sibId, 1, memo);
      rootSideUnits.push({ id: sibId, width: w });
      rootSideWidth += w + H_SPACE;
    });

    // Mother's side cousins
    let motherSideWidth = 0;
    const motherSideUnits: { id: string; width: number; isAuntUncle: boolean }[] = [];
    motherSiblings.forEach(auntUncleId => {
      const children = getChildIds(auntUncleId);
      children.forEach(cousinId => {
        const w = calcUnitWidth(cousinId, 1, memo);
        motherSideUnits.push({ id: cousinId, width: w, isAuntUncle: false });
        motherSideWidth += w + H_SPACE;
      });
    });

    // Total width at root level
    const totalRootLevelWidth = fatherSideWidth + rootSideWidth + motherSideWidth + 400;

    // Place root generation (level 0)
    const rootY = 400;
    let currentX = 200;

    // Place father's side cousins
    const fatherCousinCenters: { auntUncleId: string; cousinCenters: number[] }[] = [];
    fatherSiblings.forEach(auntUncleId => {
      const children = getChildIds(auntUncleId);
      const centers: number[] = [];
      children.forEach(cousinId => {
        const w = calcUnitWidth(cousinId, 1, memo);
        const cx = currentX + w / 2;
        centers.push(cx);
        placeUnit(cousinId, cx, rootY, 1, memo);
        currentX += w + H_SPACE;
      });
      if (centers.length > 0) {
        fatherCousinCenters.push({ auntUncleId, cousinCenters: centers });
      }
    });

    // Place root + siblings
    let rootCenterX = 0;
    const rootFamilyCenters: number[] = [];
    rootSideUnits.forEach((unit, i) => {
      const cx = currentX + unit.width / 2;
      if (unit.id === rootPersonId) rootCenterX = cx;
      rootFamilyCenters.push(cx);
      placeUnit(unit.id, cx, rootY, 1, memo);
      currentX += unit.width + H_SPACE;
    });

    // Place mother's side cousins
    const motherCousinCenters: { auntUncleId: string; cousinCenters: number[] }[] = [];
    motherSiblings.forEach(auntUncleId => {
      const children = getChildIds(auntUncleId);
      const centers: number[] = [];
      children.forEach(cousinId => {
        const w = calcUnitWidth(cousinId, 1, memo);
        const cx = currentX + w / 2;
        centers.push(cx);
        placeUnit(cousinId, cx, rootY, 1, memo);
        currentX += w + H_SPACE;
      });
      if (centers.length > 0) {
        motherCousinCenters.push({ auntUncleId, cousinCenters: centers });
      }
    });

    // Place parents level (level -1)
    const parentY = rootY - V_SPACE;

    // Father's siblings (aunts/uncles on father's side)
    fatherCousinCenters.forEach(({ auntUncleId, cousinCenters }) => {
      const auntUncleCenterX = (cousinCenters[0] + cousinCenters[cousinCenters.length - 1]) / 2;
      const spouse = getSpouseId(auntUncleId);
      const hasSpouse = spouse && !placed.has(spouse);

      if (hasSpouse) {
        place(auntUncleId, auntUncleCenterX - CARD_W - COUPLE_GAP / 2, parentY);
        place(spouse!, auntUncleCenterX + COUPLE_GAP / 2, parentY);
        line(auntUncleCenterX - COUPLE_GAP / 2, parentY + CARD_H / 2, auntUncleCenterX + COUPLE_GAP / 2, parentY + CARD_H / 2, true);
      } else {
        place(auntUncleId, auntUncleCenterX - CARD_W / 2, parentY);
      }

      // Connect to children
      const connY = parentY + CARD_H + 25;
      line(auntUncleCenterX, parentY + CARD_H, auntUncleCenterX, connY);
      if (cousinCenters.length > 1) {
        line(cousinCenters[0], connY, cousinCenters[cousinCenters.length - 1], connY);
      }
      cousinCenters.forEach(cx => line(cx, connY, cx, rootY));
    });

    // Parents (father + mother)
    const parentsCenterX = (rootFamilyCenters[0] + rootFamilyCenters[rootFamilyCenters.length - 1]) / 2;
    if (fatherId && motherId) {
      const fatherX = parentsCenterX - CARD_W - COUPLE_GAP / 2;
      const motherX = parentsCenterX + COUPLE_GAP / 2;
      place(fatherId, fatherX, parentY);
      place(motherId, motherX, parentY);
      line(fatherX + CARD_W, parentY + CARD_H / 2, motherX, parentY + CARD_H / 2, true);

      // Connect to root + siblings
      const connY = parentY + CARD_H + 25;
      line(parentsCenterX, parentY + CARD_H, parentsCenterX, connY);
      if (rootFamilyCenters.length > 1) {
        line(rootFamilyCenters[0], connY, rootFamilyCenters[rootFamilyCenters.length - 1], connY);
      }
      rootFamilyCenters.forEach(cx => line(cx, connY, cx, rootY));
    } else if (fatherId || motherId) {
      const parentId = fatherId || motherId!;
      place(parentId, parentsCenterX - CARD_W / 2, parentY);
      line(parentsCenterX, parentY + CARD_H, parentsCenterX, rootY);
    }

    // Mother's siblings (aunts/uncles on mother's side)
    motherCousinCenters.forEach(({ auntUncleId, cousinCenters }) => {
      const auntUncleCenterX = (cousinCenters[0] + cousinCenters[cousinCenters.length - 1]) / 2;
      const spouse = getSpouseId(auntUncleId);
      const hasSpouse = spouse && !placed.has(spouse);

      if (hasSpouse) {
        place(auntUncleId, auntUncleCenterX - CARD_W - COUPLE_GAP / 2, parentY);
        place(spouse!, auntUncleCenterX + COUPLE_GAP / 2, parentY);
        line(auntUncleCenterX - COUPLE_GAP / 2, parentY + CARD_H / 2, auntUncleCenterX + COUPLE_GAP / 2, parentY + CARD_H / 2, true);
      } else {
        place(auntUncleId, auntUncleCenterX - CARD_W / 2, parentY);
      }

      // Connect to children
      const connY = parentY + CARD_H + 25;
      line(auntUncleCenterX, parentY + CARD_H, auntUncleCenterX, connY);
      if (cousinCenters.length > 1) {
        line(cousinCenters[0], connY, cousinCenters[cousinCenters.length - 1], connY);
      }
      cousinCenters.forEach(cx => line(cx, connY, cx, rootY));
    });

    // Place grandparents (level -2) if maxGen >= 2
    if (maxGen >= 2) {
      const grandparentY = parentY - V_SPACE;

      // Paternal grandparents
      if (fatherId) {
        const [gfId, gmId] = getParentIds(fatherId);
        const fatherNode = nodes.find(n => n.id === fatherId);
        if (fatherNode && (gfId || gmId)) {
          const gpCenterX = fatherNode.x + CARD_W / 2;
          if (gfId && gmId) {
            place(gfId, gpCenterX - CARD_W - COUPLE_GAP / 2, grandparentY);
            place(gmId, gpCenterX + COUPLE_GAP / 2, grandparentY);
            line(gpCenterX - COUPLE_GAP / 2, grandparentY + CARD_H / 2, gpCenterX + COUPLE_GAP / 2, grandparentY + CARD_H / 2, true);
            line(gpCenterX, grandparentY + CARD_H, gpCenterX, parentY);
          } else {
            const gpId = gfId || gmId!;
            place(gpId, gpCenterX - CARD_W / 2, grandparentY);
            line(gpCenterX, grandparentY + CARD_H, gpCenterX, parentY);
          }
        }
      }

      // Maternal grandparents
      if (motherId) {
        const [gfId, gmId] = getParentIds(motherId);
        const motherNode = nodes.find(n => n.id === motherId);
        if (motherNode && (gfId || gmId)) {
          const gpCenterX = motherNode.x + CARD_W / 2;
          if (gfId && gmId) {
            place(gfId, gpCenterX - CARD_W - COUPLE_GAP / 2, grandparentY);
            place(gmId, gpCenterX + COUPLE_GAP / 2, grandparentY);
            line(gpCenterX - COUPLE_GAP / 2, grandparentY + CARD_H / 2, gpCenterX + COUPLE_GAP / 2, grandparentY + CARD_H / 2, true);
            line(gpCenterX, grandparentY + CARD_H, gpCenterX, parentY);
          } else {
            const gpId = gfId || gmId!;
            place(gpId, gpCenterX - CARD_W / 2, grandparentY);
            line(gpCenterX, grandparentY + CARD_H, gpCenterX, parentY);
          }
        }
      }
    }

    // Calculate bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(n => {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x + CARD_W);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y + CARD_H);
    });

    return { nodes, lines, bounds: { minX, maxX, minY, maxY } };
  }, [rootPersonId, rootPerson, maxGen, getIndividual, getFamily, data]);

  // Center view
  useEffect(() => {
    if (containerRef.current && nodes.length > 0 && !initialized) {
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerY = (bounds.minY + bounds.maxY) / 2;
      setPan({
        x: rect.width / 2 - centerX * zoom,
        y: rect.height / 2 - centerY * zoom
      });
      setInitialized(true);
    }
  }, [nodes.length, bounds, zoom, initialized]);

  useEffect(() => { setInitialized(false); }, [rootPersonId]);

  // Handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(Math.max(zoom * delta, 0.15), 2);
    setPan({ x: mx - (mx - pan.x) * (newZoom / zoom), y: my - (my - pan.y) * (newZoom / zoom) });
    setZoom(newZoom);
  }, [zoom, pan]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) { setIsDragging(true); setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y }); }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  const [touch, setTouch] = useState<{ start: Position | null; pinch: { d: number; z: number } | null }>({ start: null, pinch: null });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) setTouch({ start: { x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y }, pinch: null });
    else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY;
      setTouch({ start: null, pinch: { d: Math.sqrt(dx*dx + dy*dy), z: zoom } });
    }
  }, [pan, zoom]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1 && touch.start) setPan({ x: e.touches[0].clientX - touch.start.x, y: e.touches[0].clientY - touch.start.y });
    else if (e.touches.length === 2 && touch.pinch) {
      const dx = e.touches[0].clientX - e.touches[1].clientX, dy = e.touches[0].clientY - e.touches[1].clientY;
      setZoom(Math.min(Math.max(touch.pinch.z * Math.sqrt(dx*dx + dy*dy) / touch.pinch.d, 0.15), 2));
    }
  }, [touch]);

  const handleTouchEnd = useCallback(() => setTouch({ start: null, pinch: null }), []);

  const handleViewAs = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation(); setInitialized(false); setRootPersonId(id);
  }, [setRootPersonId]);

  const resetView = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2;
      setZoom(0.85);
      setPan({ x: rect.width / 2 - cx * 0.85, y: rect.height / 2 - cy * 0.85 });
    }
  }, [bounds]);

  if (!rootPerson) return <div className="flex items-center justify-center h-full text-stone-500">No person selected</div>;

  return (
    <div className="h-full flex flex-col bg-stone-50">
      <div className="flex-shrink-0 px-4 py-2 flex items-center justify-between border-b border-stone-200 bg-white">
        <span className="text-sm text-stone-600">{nodes.length} of {Object.keys(data.individuals).length} people</span>
        <div className="flex items-center gap-3">
          <select value={maxGen} onChange={(e) => { setInitialized(false); setMaxGen(parseInt(e.target.value)); }} className="px-2 py-1 text-sm border border-stone-300 rounded bg-white">
            <option value={2}>2 gen</option>
            <option value={3}>3 gen</option>
            <option value={4}>4 gen</option>
          </select>
          <button onClick={resetView} className="px-3 py-1 text-sm border border-stone-300 rounded hover:bg-stone-50">Center</button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing relative"
        onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>

        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', position: 'absolute' }}>
          {/* Lines */}
          <svg style={{ position: 'absolute', left: -2000, top: -2000, width: 8000, height: 8000, pointerEvents: 'none' }}>
            {lines.map((l, i) => (
              <line key={i} x1={l.x1 + 2000} y1={l.y1 + 2000} x2={l.x2 + 2000} y2={l.y2 + 2000}
                stroke={l.color} strokeWidth={l.color === '#f97316' ? 3 : 2} />
            ))}
          </svg>

          {/* Cards */}
          {nodes.map(node => {
            const isRoot = node.id === rootPersonId;
            const photo = node.person.photos.find(p => p.isPrimary) || node.person.photos[0];
            const deceased = !!node.person.death;

            return (
              <div key={node.id}
                className={`absolute bg-white rounded-xl shadow border-2 cursor-pointer hover:shadow-lg transition-shadow group
                  ${isRoot ? 'border-orange-400' : 'border-stone-200 hover:border-stone-300'}
                  ${selectedPersonId === node.id ? 'ring-2 ring-blue-400' : ''}`}
                style={{ left: node.x, top: node.y, width: CARD_W, height: CARD_H }}
                onClick={() => onPersonSelect?.(node.id)}>

                {isRoot && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-orange-400 rounded-l-xl" />}

                <div className="p-2 h-full flex flex-col items-center justify-center">
                  {photo ? (
                    <img src={photo.url} alt=""
                      className={`w-11 h-11 rounded-full object-cover border-2
                        ${node.person.sex === 'M' ? 'border-blue-400' : node.person.sex === 'F' ? 'border-pink-400' : 'border-stone-300'}
                        ${deceased ? 'grayscale opacity-60' : ''}`}
                      onError={(e) => (e.currentTarget.style.display = 'none')} />
                  ) : (
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold
                      ${node.person.sex === 'M' ? 'bg-blue-100 text-blue-600 border-2 border-blue-400' :
                        node.person.sex === 'F' ? 'bg-pink-100 text-pink-600 border-2 border-pink-400' :
                        'bg-stone-100 text-stone-500 border-2 border-stone-300'}
                      ${deceased ? 'opacity-60' : ''}`}>
                      {node.person.name.given[0]}
                    </div>
                  )}
                  <p className={`text-xs font-semibold text-center mt-1 truncate w-full px-1 ${deceased ? 'text-stone-400' : 'text-stone-700'}`}>
                    {node.person.name.given}
                  </p>
                  <p className={`text-[10px] text-center truncate w-full px-1 ${deceased ? 'text-stone-300' : 'text-stone-400'}`}>
                    {node.person.name.surname}
                  </p>
                </div>

                {!isRoot && (
                  <button onClick={(e) => handleViewAs(node.id, e)}
                    className="absolute inset-0 bg-black/60 text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                    View Tree
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="absolute right-4 bottom-20 flex flex-col gap-1 bg-white rounded-lg shadow-md border border-stone-200">
        <button onClick={() => setZoom(z => Math.min(z * 1.25, 2))} className="w-9 h-9 flex items-center justify-center hover:bg-stone-50 text-stone-600 text-xl">+</button>
        <div className="border-t border-stone-200" />
        <button onClick={() => setZoom(z => Math.max(z * 0.8, 0.15))} className="w-9 h-9 flex items-center justify-center hover:bg-stone-50 text-stone-600 text-xl">−</button>
      </div>
    </div>
  );
}

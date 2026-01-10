'use client';

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useFamilyTree } from '@/contexts/FamilyTreeContext';
import type { Individual } from '@/lib/types';

interface TreeCanvasProps {
  onPersonSelect?: (personId: string) => void;
  selectedPersonId?: string;
}

interface TreeNode {
  id: string;
  person: Individual;
  x: number;
  y: number;
}

interface Connection {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isSpouse?: boolean;
}

interface Position {
  x: number;
  y: number;
}

// Layout constants
const CARD_W = 110;
const CARD_H = 80;
const H_GAP = 30;
const V_GAP = 100;
const SPOUSE_GAP = 15;

export function TreeCanvas({ onPersonSelect, selectedPersonId }: TreeCanvasProps) {
  const { rootPersonId, setRootPersonId, getIndividual, getFamily, data } = useFamilyTree();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Position>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 });
  const [maxGenerations, setMaxGenerations] = useState(3);
  const containerRef = useRef<HTMLDivElement>(null);
  const [initialized, setInitialized] = useState(false);

  const rootPerson = getIndividual(rootPersonId);

  const { nodes, connections, centerX, centerY, totalPeople } = useMemo(() => {
    if (!rootPerson) return { nodes: [], connections: [], centerX: 0, centerY: 0, totalPeople: 0 };

    const nodes: TreeNode[] = [];
    const connections: Connection[] = [];
    const placedIds = new Set<string>();

    // Helper: get parents of a person
    const getParents = (personId: string): [string | null, string | null] => {
      const person = getIndividual(personId);
      if (!person?.familyAsChild) return [null, null];
      const family = getFamily(person.familyAsChild);
      if (!family) return [null, null];
      return [family.husband || null, family.wife || null];
    };

    // Helper: get primary spouse
    const getSpouseId = (personId: string): string | null => {
      const person = getIndividual(personId);
      if (!person) return null;
      for (const familyId of person.familyAsSpouse) {
        const family = getFamily(familyId);
        if (family) {
          const spouseId = family.husband === personId ? family.wife : family.husband;
          if (spouseId) return spouseId;
        }
      }
      return null;
    };

    // Helper: get children
    const getChildrenIds = (personId: string): string[] => {
      const person = getIndividual(personId);
      if (!person) return [];
      const children: string[] = [];
      for (const familyId of person.familyAsSpouse) {
        const family = getFamily(familyId);
        if (family) {
          for (const childId of family.children) {
            if (!children.includes(childId)) children.push(childId);
          }
        }
      }
      return children;
    };

    // Helper: get siblings (excluding self)
    const getSiblingIds = (personId: string): string[] => {
      const person = getIndividual(personId);
      if (!person?.familyAsChild) return [];
      const family = getFamily(person.familyAsChild);
      if (!family) return [];
      return family.children.filter(id => id !== personId);
    };

    // Calculate width needed for a person and their descendants
    const calcDescWidth = (personId: string, depth: number, visited: Set<string>): number => {
      if (depth > maxGenerations || visited.has(personId)) return CARD_W;
      visited.add(personId);

      const spouse = getSpouseId(personId);
      const baseWidth = spouse ? (CARD_W * 2 + SPOUSE_GAP) : CARD_W;

      const children = getChildrenIds(personId);
      if (children.length === 0) return baseWidth;

      let childrenWidth = 0;
      for (const childId of children) {
        childrenWidth += calcDescWidth(childId, depth + 1, new Set(visited));
      }
      childrenWidth += (children.length - 1) * H_GAP;

      return Math.max(baseWidth, childrenWidth);
    };

    // Calculate width needed for ancestors
    const calcAncWidth = (personId: string, depth: number, visited: Set<string>): number => {
      if (depth > maxGenerations || visited.has(personId)) return CARD_W;
      visited.add(personId);

      const [fatherId, motherId] = getParents(personId);
      if (!fatherId && !motherId) return CARD_W;

      let width = 0;
      if (fatherId) {
        width += calcAncWidth(fatherId, depth + 1, new Set(visited));
      }
      if (motherId) {
        width += calcAncWidth(motherId, depth + 1, new Set(visited));
      }
      if (fatherId && motherId) {
        width += SPOUSE_GAP;
      }

      return Math.max(CARD_W, width);
    };

    // Place a node
    const placeNode = (id: string, x: number, y: number) => {
      if (placedIds.has(id)) return;
      const person = getIndividual(id);
      if (!person) return;
      placedIds.add(id);
      nodes.push({ id, person, x, y });
    };

    // Place ancestors above a person
    const placeAncestors = (personId: string, centerX: number, y: number, depth: number) => {
      if (depth > maxGenerations) return;

      const [fatherId, motherId] = getParents(personId);
      if (!fatherId && !motherId) return;

      const parentY = y - V_GAP;

      if (fatherId && motherId) {
        // Both parents - calculate their individual ancestor widths
        const fatherAncWidth = calcAncWidth(fatherId, depth + 1, new Set());
        const motherAncWidth = calcAncWidth(motherId, depth + 1, new Set());
        const totalWidth = fatherAncWidth + SPOUSE_GAP + motherAncWidth;

        const fatherCenterX = centerX - totalWidth / 2 + fatherAncWidth / 2;
        const motherCenterX = centerX + totalWidth / 2 - motherAncWidth / 2;

        const fatherX = fatherCenterX - CARD_W / 2;
        const motherX = motherCenterX - CARD_W / 2;

        placeNode(fatherId, fatherX, parentY);
        placeNode(motherId, motherX, parentY);

        // Spouse line
        connections.push({
          x1: fatherX + CARD_W, y1: parentY + CARD_H / 2,
          x2: motherX, y2: parentY + CARD_H / 2,
          isSpouse: true
        });

        // Line down to child
        const midX = (fatherX + CARD_W + motherX) / 2;
        connections.push({ x1: midX, y1: parentY + CARD_H / 2, x2: midX, y2: parentY + CARD_H });
        connections.push({ x1: midX, y1: parentY + CARD_H, x2: midX, y2: parentY + CARD_H + 20 });
        connections.push({ x1: midX, y1: parentY + CARD_H + 20, x2: centerX, y2: parentY + CARD_H + 20 });
        connections.push({ x1: centerX, y1: parentY + CARD_H + 20, x2: centerX, y2: y });

        // Recurse for grandparents
        placeAncestors(fatherId, fatherCenterX, parentY, depth + 1);
        placeAncestors(motherId, motherCenterX, parentY, depth + 1);

      } else {
        // Single parent
        const parentId = fatherId || motherId!;
        const parentX = centerX - CARD_W / 2;
        placeNode(parentId, parentX, parentY);

        connections.push({ x1: centerX, y1: parentY + CARD_H, x2: centerX, y2: y });

        placeAncestors(parentId, centerX, parentY, depth + 1);
      }
    };

    // Place descendants below a person/couple
    const placeDescendants = (personId: string, unitCenterX: number, y: number, depth: number) => {
      if (depth > maxGenerations) return;

      const children = getChildrenIds(personId);
      if (children.length === 0) return;

      const childY = y + V_GAP;

      // Calculate width for each child
      const childWidths: number[] = [];
      let totalChildWidth = 0;
      for (const childId of children) {
        const w = calcDescWidth(childId, depth + 1, new Set());
        childWidths.push(w);
        totalChildWidth += w;
      }
      totalChildWidth += (children.length - 1) * H_GAP;

      // Place children
      let currentX = unitCenterX - totalChildWidth / 2;
      const childPositions: { id: string; centerX: number }[] = [];

      for (let i = 0; i < children.length; i++) {
        const childId = children[i];
        const childWidth = childWidths[i];
        const childCenterX = currentX + childWidth / 2;

        const spouse = getSpouseId(childId);

        if (spouse && !placedIds.has(spouse)) {
          // Place child and spouse
          const childX = childCenterX - CARD_W - SPOUSE_GAP / 2;
          const spouseX = childCenterX + SPOUSE_GAP / 2;

          placeNode(childId, childX, childY);
          placeNode(spouse, spouseX, childY);

          // Spouse line
          connections.push({
            x1: childX + CARD_W, y1: childY + CARD_H / 2,
            x2: spouseX, y2: childY + CARD_H / 2,
            isSpouse: true
          });

          childPositions.push({ id: childId, centerX: childCenterX });
        } else {
          // Single child
          const childX = childCenterX - CARD_W / 2;
          placeNode(childId, childX, childY);
          childPositions.push({ id: childId, centerX: childCenterX });
        }

        currentX += childWidth + H_GAP;
      }

      // Draw connection lines from parent to children
      const connectionY = y + CARD_H + 25;

      // Vertical line down from parent
      connections.push({ x1: unitCenterX, y1: y + CARD_H, x2: unitCenterX, y2: connectionY });

      if (childPositions.length === 1) {
        // Single child - straight line
        const cp = childPositions[0];
        connections.push({ x1: unitCenterX, y1: connectionY, x2: cp.centerX, y2: connectionY });
        connections.push({ x1: cp.centerX, y1: connectionY, x2: cp.centerX, y2: childY });
      } else {
        // Multiple children - horizontal bar with drops
        const leftX = childPositions[0].centerX;
        const rightX = childPositions[childPositions.length - 1].centerX;

        // Horizontal bar
        connections.push({ x1: leftX, y1: connectionY, x2: rightX, y2: connectionY });

        // Drop to each child
        for (const cp of childPositions) {
          connections.push({ x1: cp.centerX, y1: connectionY, x2: cp.centerX, y2: childY });
        }
      }

      // Recurse for grandchildren
      for (const cp of childPositions) {
        placeDescendants(cp.id, cp.centerX, childY, depth + 1);
      }
    };

    // Start building the tree
    const rootY = 300; // Start in middle vertically
    const siblings = getSiblingIds(rootPersonId);
    const rootSpouse = getSpouseId(rootPersonId);

    // Calculate total width needed at root level
    const rootDescWidth = calcDescWidth(rootPersonId, 1, new Set());
    let siblingsWidth = 0;
    const siblingWidths: number[] = [];
    for (const sibId of siblings) {
      const w = calcDescWidth(sibId, 1, new Set());
      siblingWidths.push(w);
      siblingsWidth += w + H_GAP;
    }

    const ancestorWidth = calcAncWidth(rootPersonId, 1, new Set());
    const totalNeededWidth = Math.max(ancestorWidth, rootDescWidth + siblingsWidth) + 200;

    // Position root (with spouse if exists)
    let rootCenterX = totalNeededWidth / 2 + siblingsWidth / 2;

    if (rootSpouse) {
      const rootX = rootCenterX - CARD_W - SPOUSE_GAP / 2;
      const spouseX = rootCenterX + SPOUSE_GAP / 2;

      placeNode(rootPersonId, rootX, rootY);
      placeNode(rootSpouse, spouseX, rootY);

      // Spouse line
      connections.push({
        x1: rootX + CARD_W, y1: rootY + CARD_H / 2,
        x2: spouseX, y2: rootY + CARD_H / 2,
        isSpouse: true
      });
    } else {
      placeNode(rootPersonId, rootCenterX - CARD_W / 2, rootY);
    }

    // Place ancestors
    placeAncestors(rootPersonId, rootCenterX, rootY, 1);

    // Place descendants
    placeDescendants(rootPersonId, rootCenterX, rootY, 1);

    // Place siblings to the left
    let siblingX = rootCenterX - (rootSpouse ? CARD_W + SPOUSE_GAP / 2 : CARD_W / 2) - H_GAP;

    for (let i = 0; i < siblings.length; i++) {
      const sibId = siblings[i];
      const sibWidth = siblingWidths[i];
      const sibCenterX = siblingX - sibWidth / 2;

      const sibSpouse = getSpouseId(sibId);

      if (sibSpouse && !placedIds.has(sibSpouse)) {
        const sx = sibCenterX - CARD_W - SPOUSE_GAP / 2;
        const spx = sibCenterX + SPOUSE_GAP / 2;

        placeNode(sibId, sx, rootY);
        placeNode(sibSpouse, spx, rootY);

        connections.push({
          x1: sx + CARD_W, y1: rootY + CARD_H / 2,
          x2: spx, y2: rootY + CARD_H / 2,
          isSpouse: true
        });
      } else {
        placeNode(sibId, sibCenterX - CARD_W / 2, rootY);
      }

      placeDescendants(sibId, sibCenterX, rootY, 1);

      siblingX -= sibWidth + H_GAP;
    }

    // Calculate bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x + CARD_W);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y + CARD_H);
    }

    return {
      nodes,
      connections,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      totalPeople: Object.keys(data.individuals).length
    };
  }, [rootPersonId, rootPerson, maxGenerations, getIndividual, getFamily, data.individuals]);

  // Center view on load
  useEffect(() => {
    if (containerRef.current && nodes.length > 0 && !initialized) {
      const rect = containerRef.current.getBoundingClientRect();
      setPan({
        x: rect.width / 2 - centerX * zoom,
        y: rect.height / 2 - centerY * zoom
      });
      setInitialized(true);
    }
  }, [nodes.length, centerX, centerY, zoom, initialized]);

  useEffect(() => {
    setInitialized(false);
  }, [rootPersonId]);

  // Event handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(Math.max(zoom * delta, 0.2), 3);

    setPan({
      x: mouseX - (mouseX - pan.x) * (newZoom / zoom),
      y: mouseY - (mouseY - pan.y) * (newZoom / zoom)
    });
    setZoom(newZoom);
  }, [zoom, pan]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  const [touchState, setTouchState] = useState<{ start: Position | null; pinch: { dist: number; zoom: number } | null }>({ start: null, pinch: null });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setTouchState({ start: { x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y }, pinch: null });
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      setTouchState({ start: null, pinch: { dist: Math.sqrt(dx * dx + dy * dy), zoom } });
    }
  }, [pan, zoom]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1 && touchState.start) {
      setPan({ x: e.touches[0].clientX - touchState.start.x, y: e.touches[0].clientY - touchState.start.y });
    } else if (e.touches.length === 2 && touchState.pinch) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      setZoom(Math.min(Math.max(touchState.pinch.zoom * (dist / touchState.pinch.dist), 0.2), 3));
    }
  }, [touchState]);

  const handleTouchEnd = useCallback(() => setTouchState({ start: null, pinch: null }), []);

  const handleViewAs = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setInitialized(false);
    setRootPersonId(id);
  }, [setRootPersonId]);

  const resetView = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setZoom(1);
      setPan({ x: rect.width / 2 - centerX, y: rect.height / 2 - centerY });
    }
  }, [centerX, centerY]);

  if (!rootPerson) {
    return <div className="flex items-center justify-center h-full text-warm-500">No person selected</div>;
  }

  return (
    <div className="h-full flex flex-col bg-stone-100">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-2 flex items-center justify-between border-b border-stone-200 bg-white">
        <span className="text-sm text-stone-600">{nodes.length} of {totalPeople} people</span>
        <div className="flex items-center gap-3">
          <select
            value={maxGenerations}
            onChange={(e) => { setInitialized(false); setMaxGenerations(parseInt(e.target.value)); }}
            className="px-2 py-1 text-sm border border-stone-300 rounded-md bg-white"
          >
            <option value={2}>2 gen</option>
            <option value={3}>3 gen</option>
            <option value={4}>4 gen</option>
            <option value={5}>5+ gen</option>
          </select>
          <button onClick={resetView} className="px-3 py-1 text-sm border border-stone-300 rounded-md hover:bg-stone-50">
            Center
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing relative"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            position: 'absolute'
          }}
        >
          {/* SVG for connections */}
          <svg style={{ position: 'absolute', left: -5000, top: -5000, width: 10000, height: 10000, pointerEvents: 'none' }}>
            {connections.map((c, i) => (
              <line
                key={i}
                x1={c.x1 + 5000}
                y1={c.y1 + 5000}
                x2={c.x2 + 5000}
                y2={c.y2 + 5000}
                stroke={c.isSpouse ? '#f97316' : '#9ca3af'}
                strokeWidth={c.isSpouse ? 3 : 2}
              />
            ))}
          </svg>

          {/* Person cards */}
          {nodes.map((node) => {
            const isRoot = node.id === rootPersonId;
            const isSelected = selectedPersonId === node.id;
            const photo = node.person.photos.find(p => p.isPrimary) || node.person.photos[0];
            const isDeceased = !!node.person.death;

            return (
              <div
                key={node.id}
                className={`absolute bg-white rounded-xl shadow-sm border-2 overflow-hidden cursor-pointer hover:shadow-lg transition-all group ${
                  isRoot ? 'border-orange-400 shadow-md' : 'border-stone-200 hover:border-stone-300'
                } ${isSelected ? 'ring-2 ring-blue-400' : ''}`}
                style={{ left: node.x, top: node.y, width: CARD_W, height: CARD_H }}
                onClick={() => onPersonSelect?.(node.id)}
              >
                {isRoot && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-orange-400" />}

                <div className="p-2 h-full flex flex-col items-center justify-center">
                  {photo ? (
                    <img
                      src={photo.url}
                      alt=""
                      className={`w-10 h-10 rounded-full object-cover border-2 ${
                        node.person.sex === 'M' ? 'border-blue-400' : node.person.sex === 'F' ? 'border-pink-400' : 'border-stone-300'
                      } ${isDeceased ? 'grayscale opacity-60' : ''}`}
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                  ) : (
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                      node.person.sex === 'M' ? 'bg-blue-100 text-blue-600 border-2 border-blue-400' :
                      node.person.sex === 'F' ? 'bg-pink-100 text-pink-600 border-2 border-pink-400' :
                      'bg-stone-100 text-stone-500 border-2 border-stone-300'
                    } ${isDeceased ? 'opacity-60' : ''}`}>
                      {node.person.name.given[0]}
                    </div>
                  )}

                  <p className={`text-xs font-semibold text-center leading-tight mt-1.5 truncate w-full px-1 ${isDeceased ? 'text-stone-400' : 'text-stone-700'}`}>
                    {node.person.name.given}
                  </p>
                  <p className={`text-[10px] text-center truncate w-full px-1 ${isDeceased ? 'text-stone-300' : 'text-stone-400'}`}>
                    {node.person.name.surname}
                  </p>
                </div>

                {!isRoot && (
                  <button
                    onClick={(e) => handleViewAs(node.id, e)}
                    className="absolute inset-0 bg-black/60 text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl"
                  >
                    View Tree
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Zoom controls */}
      <div className="absolute right-4 bottom-20 flex flex-col gap-1 bg-white rounded-lg shadow-md border border-stone-200">
        <button onClick={() => setZoom(z => Math.min(z * 1.25, 3))} className="w-9 h-9 flex items-center justify-center hover:bg-stone-50 text-stone-600 text-xl font-medium">+</button>
        <div className="border-t border-stone-200" />
        <button onClick={() => setZoom(z => Math.max(z * 0.8, 0.2))} className="w-9 h-9 flex items-center justify-center hover:bg-stone-50 text-stone-600 text-xl font-medium">−</button>
      </div>
    </div>
  );
}

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
  type: 'parent-child' | 'spouse' | 'sibling-bar';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface Position {
  x: number;
  y: number;
}

// Card dimensions with better spacing
const CARD_W = 100;
const CARD_H = 75;
const H_GAP = 25; // Horizontal gap between units
const V_GAP = 80; // Vertical gap between generations
const SPOUSE_GAP = 10; // Gap between spouses

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

  // Build the tree with proper width calculations
  const { nodes, connections, centerX, centerY, totalPeople } = useMemo(() => {
    if (!rootPerson) return { nodes: [], connections: [], centerX: 0, centerY: 0, totalPeople: 0 };

    const nodes: TreeNode[] = [];
    const connections: Connection[] = [];
    const placed = new Set<string>();

    // Helper functions
    const getParents = (personId: string): string[] => {
      const person = getIndividual(personId);
      if (!person?.familyAsChild) return [];
      const family = getFamily(person.familyAsChild);
      if (!family) return [];
      const parents: string[] = [];
      if (family.husband) parents.push(family.husband);
      if (family.wife) parents.push(family.wife);
      return parents;
    };

    const getSpouse = (personId: string): string | null => {
      const person = getIndividual(personId);
      if (!person) return null;
      for (const familyId of person.familyAsSpouse) {
        const family = getFamily(familyId);
        if (family) {
          const spouseId = family.husband === personId ? family.wife : family.husband;
          if (spouseId && !placed.has(spouseId)) return spouseId;
        }
      }
      return null;
    };

    const getChildren = (personId: string): string[] => {
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

    const getSiblings = (personId: string): string[] => {
      const person = getIndividual(personId);
      if (!person?.familyAsChild) return [];
      const family = getFamily(person.familyAsChild);
      if (!family) return [];
      return family.children.filter(id => id !== personId);
    };

    // Unit width (person + optional spouse)
    const unitWidth = (personId: string): number => {
      const spouse = getSpouse(personId);
      return spouse ? CARD_W * 2 + SPOUSE_GAP : CARD_W;
    };

    // Calculate descendant tree width (memoized)
    const descWidthCache = new Map<string, number>();
    const calcDescendantWidth = (personId: string, gen: number): number => {
      const key = `${personId}-${gen}`;
      if (descWidthCache.has(key)) return descWidthCache.get(key)!;

      if (gen > maxGenerations) {
        const w = unitWidth(personId);
        descWidthCache.set(key, w);
        return w;
      }

      const children = getChildren(personId);
      if (children.length === 0) {
        const w = unitWidth(personId);
        descWidthCache.set(key, w);
        return w;
      }

      let childrenTotalWidth = 0;
      for (const childId of children) {
        childrenTotalWidth += calcDescendantWidth(childId, gen + 1);
      }
      childrenTotalWidth += (children.length - 1) * H_GAP;

      const w = Math.max(unitWidth(personId), childrenTotalWidth);
      descWidthCache.set(key, w);
      return w;
    };

    // Calculate ancestor tree width
    const ancWidthCache = new Map<string, number>();
    const calcAncestorWidth = (personId: string, gen: number): number => {
      const key = `${personId}-${gen}`;
      if (ancWidthCache.has(key)) return ancWidthCache.get(key)!;

      if (gen > maxGenerations) {
        descWidthCache.set(key, CARD_W);
        return CARD_W;
      }

      const parents = getParents(personId);
      if (parents.length === 0) {
        ancWidthCache.set(key, CARD_W);
        return CARD_W;
      }

      // Each parent needs space for their own ancestors
      let totalWidth = 0;
      for (const parentId of parents) {
        totalWidth += calcAncestorWidth(parentId, gen + 1);
      }
      if (parents.length === 2) {
        totalWidth += SPOUSE_GAP; // Space between the two parents
      }

      ancWidthCache.set(key, totalWidth);
      return totalWidth;
    };

    // Place a node
    const placeNode = (id: string, x: number, y: number): boolean => {
      if (placed.has(id)) return false;
      const person = getIndividual(id);
      if (!person) return false;
      placed.add(id);
      nodes.push({ id, person, x, y });
      return true;
    };

    // Place ancestors recursively
    const placeAncestors = (personId: string, centerX: number, y: number, gen: number) => {
      if (gen > maxGenerations) return;

      const parents = getParents(personId);
      if (parents.length === 0) return;

      const parentY = y - V_GAP;

      if (parents.length === 2) {
        // Calculate widths for each parent's ancestor tree
        const p1Width = calcAncestorWidth(parents[0], gen + 1);
        const p2Width = calcAncestorWidth(parents[1], gen + 1);
        const totalWidth = p1Width + SPOUSE_GAP + p2Width;

        // Position parents
        const p1CenterX = centerX - totalWidth / 2 + p1Width / 2;
        const p2CenterX = centerX + totalWidth / 2 - p2Width / 2;

        const p1x = p1CenterX - CARD_W / 2;
        const p2x = p2CenterX - CARD_W / 2;

        if (placeNode(parents[0], p1x, parentY)) {
          placeAncestors(parents[0], p1CenterX, parentY, gen + 1);
        }
        if (placeNode(parents[1], p2x, parentY)) {
          placeAncestors(parents[1], p2CenterX, parentY, gen + 1);
        }

        // Spouse connection
        connections.push({
          type: 'spouse',
          x1: p1x + CARD_W,
          y1: parentY + CARD_H / 2,
          x2: p2x,
          y2: parentY + CARD_H / 2
        });

        // Parent to child connection
        const midX = (p1x + CARD_W + p2x) / 2;
        connections.push({
          type: 'parent-child',
          x1: midX,
          y1: parentY + CARD_H,
          x2: midX,
          y2: parentY + CARD_H + 15
        });
        connections.push({
          type: 'parent-child',
          x1: midX,
          y1: parentY + CARD_H + 15,
          x2: centerX,
          y2: parentY + CARD_H + 15
        });
        connections.push({
          type: 'parent-child',
          x1: centerX,
          y1: parentY + CARD_H + 15,
          x2: centerX,
          y2: y
        });
      } else if (parents.length === 1) {
        const px = centerX - CARD_W / 2;
        if (placeNode(parents[0], px, parentY)) {
          placeAncestors(parents[0], centerX, parentY, gen + 1);
        }
        connections.push({
          type: 'parent-child',
          x1: centerX,
          y1: parentY + CARD_H,
          x2: centerX,
          y2: y
        });
      }
    };

    // Place descendants recursively
    const placeDescendants = (personId: string, centerX: number, y: number, gen: number) => {
      if (gen > maxGenerations) return;

      const children = getChildren(personId);
      if (children.length === 0) return;

      const childY = y + V_GAP;

      // Calculate total width of all children
      const childWidths: number[] = [];
      let totalChildrenWidth = 0;
      for (const childId of children) {
        const w = calcDescendantWidth(childId, gen + 1);
        childWidths.push(w);
        totalChildrenWidth += w;
      }
      totalChildrenWidth += (children.length - 1) * H_GAP;

      // Place children
      let currentX = centerX - totalChildrenWidth / 2;
      const childCenters: number[] = [];

      for (let i = 0; i < children.length; i++) {
        const childId = children[i];
        const childWidth = childWidths[i];
        const childCenterX = currentX + childWidth / 2;
        childCenters.push(childCenterX);

        // Check for spouse
        const spouse = getSpouse(childId);

        if (spouse) {
          // Place child and spouse as a unit
          const childX = childCenterX - (CARD_W + SPOUSE_GAP / 2);
          const spouseX = childCenterX + SPOUSE_GAP / 2;

          placeNode(childId, childX, childY);
          placeNode(spouse, spouseX, childY);

          // Spouse connection
          connections.push({
            type: 'spouse',
            x1: childX + CARD_W,
            y1: childY + CARD_H / 2,
            x2: spouseX,
            y2: childY + CARD_H / 2
          });

          // Recurse for grandchildren
          placeDescendants(childId, childCenterX, childY, gen + 1);
        } else {
          // Single person
          const childX = childCenterX - CARD_W / 2;
          placeNode(childId, childX, childY);
          placeDescendants(childId, childCenterX, childY, gen + 1);
        }

        currentX += childWidth + H_GAP;
      }

      // Draw connections from parent to children
      const barY = y + CARD_H + 20;

      // Vertical from parent
      connections.push({
        type: 'parent-child',
        x1: centerX,
        y1: y + CARD_H,
        x2: centerX,
        y2: barY
      });

      // Horizontal bar
      if (childCenters.length > 1) {
        connections.push({
          type: 'sibling-bar',
          x1: childCenters[0],
          y1: barY,
          x2: childCenters[childCenters.length - 1],
          y2: barY
        });
      }

      // Vertical to each child
      for (const cx of childCenters) {
        connections.push({
          type: 'parent-child',
          x1: cx,
          y1: barY,
          x2: cx,
          y2: childY
        });
      }
    };

    // Start placing from root
    const rootY = 0;
    const rootSpouse = getSpouse(rootPersonId);
    const siblings = getSiblings(rootPersonId);

    // Calculate total width needed for root level (root + spouse + siblings with their spouses)
    let rootLevelWidth = unitWidth(rootPersonId);
    const siblingWidths: number[] = [];
    for (const sibId of siblings) {
      const sibW = calcDescendantWidth(sibId, 1);
      siblingWidths.push(sibW);
      rootLevelWidth += sibW + H_GAP;
    }

    // Also need space for ancestors above
    const ancestorWidth = calcAncestorWidth(rootPersonId, 1);
    const descendantWidth = calcDescendantWidth(rootPersonId, 1);
    const neededWidth = Math.max(ancestorWidth, rootLevelWidth, descendantWidth);

    // Place root
    let rootCenterX = neededWidth / 2;

    if (rootSpouse) {
      const rootX = rootCenterX - CARD_W - SPOUSE_GAP / 2;
      const spouseX = rootCenterX + SPOUSE_GAP / 2;

      placeNode(rootPersonId, rootX, rootY);
      placeNode(rootSpouse, spouseX, rootY);

      connections.push({
        type: 'spouse',
        x1: rootX + CARD_W,
        y1: rootY + CARD_H / 2,
        x2: spouseX,
        y2: rootY + CARD_H / 2
      });
    } else {
      placeNode(rootPersonId, rootCenterX - CARD_W / 2, rootY);
    }

    // Place ancestors
    placeAncestors(rootPersonId, rootCenterX, rootY, 1);

    // Place descendants
    placeDescendants(rootPersonId, rootCenterX, rootY, 1);

    // Place siblings to the left of root
    let siblingX = rootCenterX - unitWidth(rootPersonId) / 2 - H_GAP;

    for (let i = 0; i < siblings.length; i++) {
      const sibId = siblings[i];
      const sibWidth = siblingWidths[i];
      const sibCenterX = siblingX - sibWidth / 2;

      const sibSpouse = getSpouse(sibId);
      if (sibSpouse) {
        const sx = sibCenterX - CARD_W - SPOUSE_GAP / 2;
        const spx = sibCenterX + SPOUSE_GAP / 2;
        placeNode(sibId, sx, rootY);
        placeNode(sibSpouse, spx, rootY);
        connections.push({
          type: 'spouse',
          x1: sx + CARD_W,
          y1: rootY + CARD_H / 2,
          x2: spx,
          y2: rootY + CARD_H / 2
        });
      } else {
        placeNode(sibId, sibCenterX - CARD_W / 2, rootY);
      }

      placeDescendants(sibId, sibCenterX, rootY, 1);

      siblingX -= sibWidth + H_GAP;
    }

    // Calculate bounds for centering
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

  // Center on load
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

  // Reset on root change
  useEffect(() => {
    setInitialized(false);
  }, [rootPersonId]);

  // Mouse handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(Math.max(zoom * delta, 0.3), 2.5);

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

  // Touch handlers
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
      setZoom(Math.min(Math.max(touchState.pinch.zoom * (dist / touchState.pinch.dist), 0.3), 2.5));
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
        <div className="flex items-center gap-4">
          <span className="text-sm text-stone-600">{nodes.length} of {totalPeople} people</span>
        </div>
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
          {/* Connection lines */}
          <svg style={{ position: 'absolute', left: -5000, top: -5000, width: 10000, height: 10000, pointerEvents: 'none' }}>
            {connections.map((c, i) => (
              <line
                key={i}
                x1={c.x1 + 5000}
                y1={c.y1 + 5000}
                x2={c.x2 + 5000}
                y2={c.y2 + 5000}
                stroke={c.type === 'spouse' ? '#f97316' : '#a8a29e'}
                strokeWidth={c.type === 'spouse' ? 2.5 : 1.5}
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
                className={`absolute bg-white rounded-lg shadow-sm border overflow-hidden cursor-pointer hover:shadow-md transition-shadow group ${
                  isRoot ? 'border-orange-400 border-2' : 'border-stone-200'
                } ${isSelected ? 'ring-2 ring-blue-400' : ''}`}
                style={{ left: node.x, top: node.y, width: CARD_W, height: CARD_H }}
                onClick={() => onPersonSelect?.(node.id)}
              >
                {/* Orange accent bar for root */}
                {isRoot && <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-400" />}

                <div className="p-1.5 h-full flex flex-col items-center justify-center">
                  {/* Photo */}
                  {photo ? (
                    <img
                      src={photo.url}
                      alt=""
                      className={`w-9 h-9 rounded-full object-cover border-2 ${
                        node.person.sex === 'M' ? 'border-blue-300' : node.person.sex === 'F' ? 'border-pink-300' : 'border-stone-300'
                      } ${isDeceased ? 'grayscale opacity-70' : ''}`}
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                  ) : (
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                      node.person.sex === 'M' ? 'bg-blue-100 text-blue-600 border-2 border-blue-300' :
                      node.person.sex === 'F' ? 'bg-pink-100 text-pink-600 border-2 border-pink-300' :
                      'bg-stone-100 text-stone-500 border-2 border-stone-300'
                    } ${isDeceased ? 'opacity-70' : ''}`}>
                      {node.person.name.given[0]}
                    </div>
                  )}

                  {/* Name */}
                  <p className={`text-xs font-medium text-center leading-tight mt-1 truncate w-full px-1 ${isDeceased ? 'text-stone-400' : 'text-stone-700'}`}>
                    {node.person.name.given}
                  </p>
                  <p className={`text-[10px] text-center truncate w-full px-1 ${isDeceased ? 'text-stone-300' : 'text-stone-400'}`}>
                    {node.person.name.surname}
                  </p>
                </div>

                {/* View button on hover */}
                {!isRoot && (
                  <button
                    onClick={(e) => handleViewAs(node.id, e)}
                    className="absolute inset-0 bg-black/50 text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
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
        <button onClick={() => setZoom(z => Math.min(z * 1.2, 2.5))} className="w-8 h-8 flex items-center justify-center hover:bg-stone-50 text-stone-600 text-lg font-medium">+</button>
        <div className="border-t border-stone-200" />
        <button onClick={() => setZoom(z => Math.max(z * 0.8, 0.3))} className="w-8 h-8 flex items-center justify-center hover:bg-stone-50 text-stone-600 text-lg font-medium">−</button>
      </div>
    </div>
  );
}

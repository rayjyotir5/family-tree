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
  spouseId?: string;
}

interface Connection {
  type: 'vertical' | 'horizontal' | 'spouse' | 'child-bar';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface Position {
  x: number;
  y: number;
}

// Compact card dimensions (MyHeritage style)
const CARD_W = 100;
const CARD_H = 75;
const H_GAP = 15;
const V_GAP = 60;
const SPOUSE_GAP = 8;

export function TreeCanvas({ onPersonSelect, selectedPersonId }: TreeCanvasProps) {
  const { rootPersonId, setRootPersonId, getRelationshipWithChain, getIndividual, getFamily, data } = useFamilyTree();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Position>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 });
  const [maxGenerations, setMaxGenerations] = useState(5);
  const containerRef = useRef<HTMLDivElement>(null);
  const [initialized, setInitialized] = useState(false);

  const rootPerson = getIndividual(rootPersonId);

  // Build the tree
  const { nodes, connections, centerX, centerY, totalPeople } = useMemo(() => {
    if (!rootPerson) return { nodes: [], connections: [], centerX: 0, centerY: 0, totalPeople: 0 };

    const nodes: TreeNode[] = [];
    const connections: Connection[] = [];
    const placed = new Set<string>();

    const placeNode = (id: string, x: number, y: number, spouseId?: string): boolean => {
      if (placed.has(id)) return false;
      const person = getIndividual(id);
      if (!person) return false;
      placed.add(id);
      nodes.push({ id, person, x, y, spouseId });
      return true;
    };

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
          if (spouseId) return spouseId;
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

    // Calculate width of a family unit (person + spouse)
    const unitWidth = (hasSpouse: boolean) => hasSpouse ? CARD_W * 2 + SPOUSE_GAP : CARD_W;

    // Calculate total width needed for children
    const calcChildrenWidth = (personId: string, gen: number): number => {
      if (gen > maxGenerations) return 0;
      const children = getChildren(personId);
      if (children.length === 0) return unitWidth(!!getSpouse(personId));

      let totalW = 0;
      for (const cid of children) {
        const childSpouse = getSpouse(cid);
        const childW = calcChildrenWidth(cid, gen + 1);
        totalW += Math.max(unitWidth(!!childSpouse), childW);
      }
      totalW += (children.length - 1) * H_GAP;
      return Math.max(unitWidth(!!getSpouse(personId)), totalW);
    };

    // Place ancestors going up
    const placeAncestors = (personId: string, x: number, y: number, gen: number) => {
      if (gen > maxGenerations) return;
      const parents = getParents(personId);
      if (parents.length === 0) return;

      const parentY = y - V_GAP;

      // Calculate positions for parent pair
      if (parents.length === 2) {
        const p1x = x - (CARD_W + SPOUSE_GAP) / 2;
        const p2x = x + (CARD_W + SPOUSE_GAP) / 2;

        if (placeNode(parents[0], p1x, parentY, parents[1])) {
          // Vertical line from parent to child connection point
          connections.push({ type: 'vertical', x1: p1x + CARD_W / 2 + SPOUSE_GAP / 2, y1: parentY + CARD_H, x2: p1x + CARD_W / 2 + SPOUSE_GAP / 2, y2: y - 10 });
          connections.push({ type: 'vertical', x1: x, y1: y - 10, x2: x, y2: y });
          placeAncestors(parents[0], p1x, parentY, gen + 1);
        }
        if (placeNode(parents[1], p2x, parentY)) {
          // Spouse connector
          connections.push({ type: 'spouse', x1: p1x + CARD_W, y1: parentY + CARD_H / 2, x2: p2x, y2: parentY + CARD_H / 2 });
          placeAncestors(parents[1], p2x, parentY, gen + 1);
        }
      } else if (parents.length === 1) {
        if (placeNode(parents[0], x, parentY)) {
          connections.push({ type: 'vertical', x1: x + CARD_W / 2, y1: parentY + CARD_H, x2: x + CARD_W / 2, y2: y });
          placeAncestors(parents[0], x, parentY, gen + 1);
        }
      }
    };

    // Place descendants going down
    const placeDescendants = (personId: string, centerX: number, y: number, gen: number) => {
      if (gen > maxGenerations) return;
      const children = getChildren(personId);
      if (children.length === 0) return;

      const childY = y + V_GAP;

      // Calculate widths
      const childWidths: number[] = [];
      let totalWidth = 0;
      for (const cid of children) {
        const spouse = getSpouse(cid);
        const w = Math.max(unitWidth(!!spouse), calcChildrenWidth(cid, gen + 1));
        childWidths.push(w);
        totalWidth += w;
      }
      totalWidth += (children.length - 1) * H_GAP;

      // Draw parent-to-children connector
      const barY = y + CARD_H + 15;
      connections.push({ type: 'vertical', x1: centerX, y1: y + CARD_H, x2: centerX, y2: barY });

      let startX = centerX - totalWidth / 2;
      const childCenters: number[] = [];

      for (let i = 0; i < children.length; i++) {
        const cid = children[i];
        const spouse = getSpouse(cid);
        const w = childWidths[i];
        const childCenterX = startX + w / 2;
        childCenters.push(childCenterX);

        // Place child
        const childX = spouse ? childCenterX - (CARD_W + SPOUSE_GAP) / 2 : childCenterX - CARD_W / 2;
        if (placeNode(cid, childX, childY, spouse || undefined)) {
          // Vertical line to child
          connections.push({ type: 'vertical', x1: childCenterX, y1: barY, x2: childCenterX, y2: childY });
        }

        // Place spouse
        if (spouse) {
          const spouseX = childX + CARD_W + SPOUSE_GAP;
          if (placeNode(spouse, spouseX, childY)) {
            connections.push({ type: 'spouse', x1: childX + CARD_W, y1: childY + CARD_H / 2, x2: spouseX, y2: childY + CARD_H / 2 });
          }
        }

        // Recurse for grandchildren
        placeDescendants(cid, childCenterX, childY, gen + 1);

        startX += w + H_GAP;
      }

      // Horizontal bar connecting all children
      if (childCenters.length > 1) {
        connections.push({ type: 'child-bar', x1: childCenters[0], y1: barY, x2: childCenters[childCenters.length - 1], y2: barY });
      }
    };

    // Start with root
    const rootX = 0;
    const rootY = 0;
    const rootSpouse = getSpouse(rootPersonId);

    if (rootSpouse) {
      // Place root and spouse as a pair
      placeNode(rootPersonId, rootX - CARD_W - SPOUSE_GAP / 2, rootY, rootSpouse);
      placeNode(rootSpouse, rootX + SPOUSE_GAP / 2, rootY);
      connections.push({ type: 'spouse', x1: rootX - SPOUSE_GAP / 2, y1: rootY + CARD_H / 2, x2: rootX + SPOUSE_GAP / 2, y2: rootY + CARD_H / 2 });

      placeAncestors(rootPersonId, rootX - CARD_W / 2 - SPOUSE_GAP / 2, rootY, 1);
      placeDescendants(rootPersonId, rootX, rootY, 1);
    } else {
      placeNode(rootPersonId, rootX - CARD_W / 2, rootY);
      placeAncestors(rootPersonId, rootX - CARD_W / 2, rootY, 1);
      placeDescendants(rootPersonId, rootX, rootY, 1);
    }

    // Place siblings (same level as root)
    const siblings = getSiblings(rootPersonId);
    let sibX = rootX - (rootSpouse ? CARD_W * 2 + SPOUSE_GAP : CARD_W) - H_GAP - CARD_W;
    for (const sibId of siblings) {
      const sibSpouse = getSpouse(sibId);
      if (sibSpouse) {
        if (placeNode(sibId, sibX - CARD_W - SPOUSE_GAP, rootY, sibSpouse)) {
          placeNode(sibSpouse, sibX, rootY);
          connections.push({ type: 'spouse', x1: sibX - SPOUSE_GAP, y1: rootY + CARD_H / 2, x2: sibX, y2: rootY + CARD_H / 2 });
          placeDescendants(sibId, sibX - CARD_W / 2 - SPOUSE_GAP / 2, rootY, 1);
        }
        sibX -= CARD_W * 2 + SPOUSE_GAP + H_GAP;
      } else {
        if (placeNode(sibId, sibX, rootY)) {
          placeDescendants(sibId, sibX + CARD_W / 2, rootY, 1);
        }
        sibX -= CARD_W + H_GAP;
      }
    }

    // Calculate center
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x + CARD_W);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y + CARD_H);
    }
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    return { nodes, connections, centerX, centerY, totalPeople: Object.keys(data.individuals).length };
  }, [rootPersonId, rootPerson, maxGenerations, getIndividual, getFamily, data.individuals]);

  // Center on load
  useEffect(() => {
    if (containerRef.current && nodes.length > 0 && !initialized) {
      const rect = containerRef.current.getBoundingClientRect();
      setPan({
        x: rect.width / 2 - centerX * zoom,
        y: rect.height / 3 - centerY * zoom + 100
      });
      setInitialized(true);
    }
  }, [nodes.length, centerX, centerY, zoom, initialized]);

  // Reset on root change
  useEffect(() => {
    setInitialized(false);
  }, [rootPersonId]);

  // Mouse/touch handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(Math.max(zoom * delta, 0.3), 2.5);

    // Zoom towards mouse position
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
      setPan({ x: rect.width / 2 - centerX, y: rect.height / 3 - centerY + 100 });
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
            <option value={5}>5+</option>
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
          <svg style={{ position: 'absolute', left: -3000, top: -3000, width: 6000, height: 6000, pointerEvents: 'none' }}>
            {connections.map((c, i) => (
              <line
                key={i}
                x1={c.x1 + 3000}
                y1={c.y1 + 3000}
                x2={c.x2 + 3000}
                y2={c.y2 + 3000}
                stroke={c.type === 'spouse' ? '#f97316' : '#a8a29e'}
                strokeWidth={c.type === 'spouse' ? 2 : 1.5}
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
                className={`absolute bg-white rounded-lg shadow-sm border overflow-hidden cursor-pointer hover:shadow-md transition-shadow ${
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
                    className="absolute inset-0 bg-black/50 text-white text-xs font-medium opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center"
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

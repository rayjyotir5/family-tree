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
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  isSpouse?: boolean;
}

interface Position {
  x: number;
  y: number;
}

const NODE_WIDTH = 150;
const NODE_HEIGHT = 90;
const H_GAP = 30;
const V_GAP = 100;

export function TreeCanvas({ onPersonSelect, selectedPersonId }: TreeCanvasProps) {
  const { rootPersonId, setRootPersonId, getRelationshipWithChain, getIndividual, getFamily } = useFamilyTree();
  const [zoom, setZoom] = useState(0.8);
  const [pan, setPan] = useState<Position>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 });
  const [maxGenerations, setMaxGenerations] = useState(3);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasInitialized, setHasInitialized] = useState(false);

  const rootPerson = getIndividual(rootPersonId);

  // Build hierarchical tree
  const { nodes, connections, centerX, centerY } = useMemo(() => {
    if (!rootPerson) return { nodes: [], connections: [], centerX: 0, centerY: 0 };

    const nodes: TreeNode[] = [];
    const connections: Connection[] = [];
    const placed = new Set<string>();

    // Place a person node
    const placeNode = (id: string, x: number, y: number): boolean => {
      if (placed.has(id)) return false;
      const person = getIndividual(id);
      if (!person) return false;

      placed.add(id);
      nodes.push({ id, person, x, y });
      return true;
    };

    // Get all children of a person
    const getChildren = (personId: string): string[] => {
      const person = getIndividual(personId);
      if (!person) return [];

      const children: string[] = [];
      for (const familyId of person.familyAsSpouse) {
        const family = getFamily(familyId);
        if (family) {
          for (const childId of family.children) {
            if (!children.includes(childId)) {
              children.push(childId);
            }
          }
        }
      }
      return children;
    };

    // Get parents of a person
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

    // Get siblings of a person
    const getSiblings = (personId: string): string[] => {
      const person = getIndividual(personId);
      if (!person?.familyAsChild) return [];

      const family = getFamily(person.familyAsChild);
      if (!family) return [];

      return family.children.filter(id => id !== personId);
    };

    // Get spouse(s) of a person
    const getSpouses = (personId: string): string[] => {
      const person = getIndividual(personId);
      if (!person) return [];

      const spouses: string[] = [];
      for (const familyId of person.familyAsSpouse) {
        const family = getFamily(familyId);
        if (family) {
          const spouseId = family.husband === personId ? family.wife : family.husband;
          if (spouseId && !spouses.includes(spouseId)) {
            spouses.push(spouseId);
          }
        }
      }
      return spouses;
    };

    // Calculate width needed for a subtree
    const calcWidth = (personId: string, gen: number, direction: 'up' | 'down'): number => {
      if (gen > maxGenerations) return NODE_WIDTH;

      const person = getIndividual(personId);
      if (!person) return NODE_WIDTH;

      if (direction === 'up') {
        const parents = getParents(personId);
        if (parents.length === 0) return NODE_WIDTH;

        let w = 0;
        for (const pid of parents) {
          w += calcWidth(pid, gen + 1, 'up');
        }
        w += (parents.length - 1) * H_GAP;
        return Math.max(NODE_WIDTH, w);
      } else {
        const children = getChildren(personId);
        if (children.length === 0) return NODE_WIDTH;

        let w = 0;
        for (const cid of children) {
          w += calcWidth(cid, gen + 1, 'down');
        }
        w += (children.length - 1) * H_GAP;
        return Math.max(NODE_WIDTH, w);
      }
    };

    // Place ancestors recursively
    const placeAncestors = (personId: string, cx: number, cy: number, gen: number) => {
      if (gen > maxGenerations) return;

      const parents = getParents(personId);
      if (parents.length === 0) return;

      const py = cy - V_GAP;
      let totalW = 0;
      const widths: number[] = [];

      for (const pid of parents) {
        const w = calcWidth(pid, gen + 1, 'up');
        widths.push(w);
        totalW += w;
      }
      totalW += (parents.length - 1) * H_GAP;

      let startX = cx - totalW / 2;

      for (let i = 0; i < parents.length; i++) {
        const pid = parents[i];
        const px = startX + widths[i] / 2;

        if (placeNode(pid, px, py)) {
          // Connect parent to child
          connections.push({
            fromX: px,
            fromY: py + NODE_HEIGHT / 2,
            toX: cx,
            toY: cy - NODE_HEIGHT / 2
          });

          // Recurse up
          placeAncestors(pid, px, py, gen + 1);
        }

        startX += widths[i] + H_GAP;
      }

      // Connect parents as spouses
      if (parents.length === 2) {
        const n1 = nodes.find(n => n.id === parents[0]);
        const n2 = nodes.find(n => n.id === parents[1]);
        if (n1 && n2) {
          connections.push({
            fromX: n1.x + NODE_WIDTH / 2 - 10,
            fromY: n1.y,
            toX: n2.x - NODE_WIDTH / 2 + 10,
            toY: n2.y,
            isSpouse: true
          });
        }
      }
    };

    // Place descendants recursively
    const placeDescendants = (personId: string, cx: number, cy: number, gen: number) => {
      if (gen > maxGenerations) return;

      const children = getChildren(personId);
      if (children.length === 0) return;

      const childY = cy + V_GAP;
      let totalW = 0;
      const widths: number[] = [];

      for (const cid of children) {
        const w = calcWidth(cid, gen + 1, 'down');
        widths.push(w);
        totalW += w;
      }
      totalW += (children.length - 1) * H_GAP;

      let startX = cx - totalW / 2;

      for (let i = 0; i < children.length; i++) {
        const cid = children[i];
        const childX = startX + widths[i] / 2;

        if (placeNode(cid, childX, childY)) {
          // Connect to parent
          connections.push({
            fromX: cx,
            fromY: cy + NODE_HEIGHT / 2,
            toX: childX,
            toY: childY - NODE_HEIGHT / 2
          });

          // Add spouse next to child
          const spouses = getSpouses(cid);
          for (const sid of spouses) {
            if (placeNode(sid, childX + NODE_WIDTH + 20, childY)) {
              connections.push({
                fromX: childX + NODE_WIDTH / 2 - 10,
                fromY: childY,
                toX: childX + NODE_WIDTH + 20 - NODE_WIDTH / 2 + 10,
                toY: childY,
                isSpouse: true
              });
            }
          }

          // Recurse down
          placeDescendants(cid, childX, childY, gen + 1);
        }

        startX += widths[i] + H_GAP;
      }
    };

    // Start with root at center
    const rootX = 0;
    const rootY = 0;
    placeNode(rootPersonId, rootX, rootY);

    // Add spouse(s) to the right
    const rootSpouses = getSpouses(rootPersonId);
    let spouseX = rootX + NODE_WIDTH + 20;
    for (const sid of rootSpouses) {
      if (placeNode(sid, spouseX, rootY)) {
        connections.push({
          fromX: rootX + NODE_WIDTH / 2 - 10,
          fromY: rootY,
          toX: spouseX - NODE_WIDTH / 2 + 10,
          toY: rootY,
          isSpouse: true
        });
        spouseX += NODE_WIDTH + 20;
      }
    }

    // Add siblings to the left
    const siblings = getSiblings(rootPersonId);
    let sibX = rootX - NODE_WIDTH - H_GAP;
    for (const sibId of siblings) {
      if (placeNode(sibId, sibX, rootY)) {
        // Add sibling's spouse
        const sibSpouses = getSpouses(sibId);
        for (const sid of sibSpouses) {
          if (placeNode(sid, sibX - NODE_WIDTH - 20, rootY)) {
            connections.push({
              fromX: sibX - NODE_WIDTH / 2 + 10,
              fromY: rootY,
              toX: sibX - NODE_WIDTH - 20 + NODE_WIDTH / 2 - 10,
              toY: rootY,
              isSpouse: true
            });
          }
        }

        // Place sibling's children
        placeDescendants(sibId, sibX, rootY, 1);

        sibX -= NODE_WIDTH + H_GAP;
      }
    }

    // Place ancestors (parents, grandparents, etc.)
    placeAncestors(rootPersonId, rootX, rootY, 1);

    // Place descendants (children, grandchildren, etc.)
    placeDescendants(rootPersonId, rootX, rootY, 1);

    // Find center of all nodes
    let sumX = 0, sumY = 0;
    for (const n of nodes) {
      sumX += n.x;
      sumY += n.y;
    }
    const centerX = nodes.length > 0 ? sumX / nodes.length : 0;
    const centerY = nodes.length > 0 ? sumY / nodes.length : 0;

    return { nodes, connections, centerX, centerY };
  }, [rootPersonId, rootPerson, maxGenerations, getIndividual, getFamily]);

  // Center view when tree changes
  useEffect(() => {
    if (containerRef.current && nodes.length > 0) {
      const rect = containerRef.current.getBoundingClientRect();
      setPan({
        x: rect.width / 2 - centerX * zoom,
        y: rect.height / 2 - centerY * zoom
      });
      setHasInitialized(true);
    }
  }, [nodes.length, centerX, centerY, rootPersonId]);

  // Recenter when zoom changes (only after init)
  useEffect(() => {
    if (hasInitialized && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPan({
        x: rect.width / 2 - centerX * zoom,
        y: rect.height / 2 - centerY * zoom
      });
    }
  }, [zoom, hasInitialized, centerX, centerY]);

  // Mouse handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(Math.max(z * delta, 0.2), 2));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch handlers
  const [touchStart, setTouchStart] = useState<Position | null>(null);
  const [pinchStart, setPinchStart] = useState<{ dist: number; zoom: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setTouchStart({ x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y });
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      setPinchStart({ dist: Math.sqrt(dx * dx + dy * dy), zoom });
    }
  }, [pan, zoom]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1 && touchStart) {
      setPan({
        x: e.touches[0].clientX - touchStart.x,
        y: e.touches[0].clientY - touchStart.y
      });
    } else if (e.touches.length === 2 && pinchStart) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      setZoom(Math.min(Math.max(pinchStart.zoom * (dist / pinchStart.dist), 0.2), 2));
    }
  }, [touchStart, pinchStart]);

  const handleTouchEnd = useCallback(() => {
    setTouchStart(null);
    setPinchStart(null);
  }, []);

  const handlePersonClick = useCallback((personId: string) => {
    onPersonSelect?.(personId);
  }, [onPersonSelect]);

  const handleViewAs = useCallback((personId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHasInitialized(false);
    setRootPersonId(personId);
  }, [setRootPersonId]);

  const resetView = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setZoom(0.8);
      setPan({
        x: rect.width / 2 - centerX * 0.8,
        y: rect.height / 2 - centerY * 0.8
      });
    }
  }, [centerX, centerY]);

  if (!rootPerson) {
    return (
      <div className="flex items-center justify-center h-full text-warm-500">
        <p>No person selected</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-warm-50 to-warm-100">
      {/* Controls */}
      <div className="flex-shrink-0 p-3 flex flex-wrap gap-3 items-center justify-center border-b border-warm-200 bg-white/90 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom(z => Math.min(z * 1.25, 2))}
            className="w-9 h-9 flex items-center justify-center bg-white border border-warm-300 rounded-lg hover:bg-warm-50 text-warm-700 font-bold text-lg"
          >
            +
          </button>
          <span className="text-sm text-warm-600 w-12 text-center font-medium">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(z => Math.max(z * 0.8, 0.2))}
            className="w-9 h-9 flex items-center justify-center bg-white border border-warm-300 rounded-lg hover:bg-warm-50 text-warm-700 font-bold text-lg"
          >
            -
          </button>
        </div>

        <button
          onClick={resetView}
          className="px-3 py-2 bg-white border border-warm-300 rounded-lg hover:bg-warm-50 text-sm text-warm-700 font-medium"
        >
          Center
        </button>

        <label className="flex items-center gap-2 text-sm text-warm-600">
          <span>Depth:</span>
          <select
            value={maxGenerations}
            onChange={(e) => setMaxGenerations(parseInt(e.target.value))}
            className="px-2 py-2 border border-warm-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
            <option value={5}>5</option>
          </select>
        </label>

        <span className="text-xs text-warm-500">
          {nodes.length} people
        </span>
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
            position: 'absolute',
            left: 0,
            top: 0
          }}
        >
          {/* SVG for connections */}
          <svg
            style={{
              position: 'absolute',
              left: -2000,
              top: -2000,
              width: 4000,
              height: 4000,
              pointerEvents: 'none'
            }}
          >
            {connections.map((conn, i) => (
              <path
                key={i}
                d={conn.isSpouse
                  ? `M ${conn.fromX + 2000} ${conn.fromY + 2000} L ${conn.toX + 2000} ${conn.toY + 2000}`
                  : `M ${conn.fromX + 2000} ${conn.fromY + 2000}
                     C ${conn.fromX + 2000} ${(conn.fromY + conn.toY) / 2 + 2000},
                       ${conn.toX + 2000} ${(conn.fromY + conn.toY) / 2 + 2000},
                       ${conn.toX + 2000} ${conn.toY + 2000}`
                }
                stroke={conn.isSpouse ? '#dd6b5b' : '#a8a29e'}
                strokeWidth={conn.isSpouse ? 3 : 2}
                strokeDasharray={conn.isSpouse ? '8,4' : 'none'}
                fill="none"
              />
            ))}
          </svg>

          {/* Person nodes */}
          {nodes.map((node) => {
            const isRoot = node.id === rootPersonId;
            const isSelected = selectedPersonId === node.id;
            const relationship = getRelationshipWithChain(rootPersonId, node.id);
            const photo = node.person.photos.find(p => p.isPrimary) || node.person.photos[0];
            const isDeceased = !!node.person.death;

            return (
              <div
                key={node.id}
                className={`
                  absolute rounded-xl shadow-md border-2 cursor-pointer select-none
                  transition-shadow hover:shadow-xl
                  ${isRoot ? 'border-primary-500 bg-primary-50' : 'border-warm-200 bg-white'}
                  ${isSelected ? 'ring-2 ring-accent-500 ring-offset-2' : ''}
                  ${isDeceased ? 'opacity-80' : ''}
                `}
                style={{
                  left: node.x - NODE_WIDTH / 2,
                  top: node.y - NODE_HEIGHT / 2,
                  width: NODE_WIDTH,
                  height: NODE_HEIGHT
                }}
                onClick={() => handlePersonClick(node.id)}
              >
                <div className="p-2 h-full flex gap-2">
                  {/* Photo */}
                  <div className="flex-shrink-0">
                    {photo ? (
                      <img
                        src={photo.url}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover border border-warm-200"
                        onError={(e) => (e.currentTarget.style.display = 'none')}
                      />
                    ) : (
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                        node.person.sex === 'M' ? 'bg-blue-100 text-blue-700' :
                        node.person.sex === 'F' ? 'bg-pink-100 text-pink-700' :
                        'bg-warm-100 text-warm-600'
                      }`}>
                        {node.person.name.given[0]}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <p className="font-semibold text-warm-800 text-sm truncate leading-tight">
                      {node.person.name.given}
                    </p>
                    <p className="text-xs text-warm-500 truncate">
                      {node.person.name.surname}
                    </p>
                    <p className="text-xs text-primary-600 font-medium truncate mt-0.5">
                      {isRoot ? 'You' : relationship}
                    </p>
                  </div>
                </div>

                {/* View button */}
                {!isRoot && (
                  <button
                    onClick={(e) => handleViewAs(node.id, e)}
                    className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-2 py-0.5 text-xs bg-primary-500 hover:bg-primary-600 text-white rounded-full font-medium shadow"
                  >
                    View
                  </button>
                )}

                {/* Gender badge */}
                <div className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-xs flex items-center justify-center border-2 border-white shadow ${
                  node.person.sex === 'M' ? 'bg-blue-100 text-blue-600' :
                  node.person.sex === 'F' ? 'bg-pink-100 text-pink-600' :
                  'bg-warm-100 text-warm-500'
                }`}>
                  {node.person.sex === 'M' ? '♂' : node.person.sex === 'F' ? '♀' : '?'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 p-2 text-center text-xs text-warm-500 bg-white/90 border-t border-warm-200">
        Drag to pan • Scroll to zoom • Tap person for details
      </div>
    </div>
  );
}

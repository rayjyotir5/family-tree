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
  children: TreeNode[];
  spouseId?: string;
}

interface Position {
  x: number;
  y: number;
}

const NODE_WIDTH = 160;
const NODE_HEIGHT = 100;
const HORIZONTAL_SPACING = 40;
const VERTICAL_SPACING = 120;
const SPOUSE_SPACING = 20;

export function TreeCanvas({ onPersonSelect, selectedPersonId }: TreeCanvasProps) {
  const { rootPersonId, setRootPersonId, getRelationshipWithChain, getIndividual, getFamily } = useFamilyTree();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Position>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 });
  const [maxGenerations, setMaxGenerations] = useState(3);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const rootPerson = getIndividual(rootPersonId);

  // Build hierarchical tree structure
  const { nodes, connections, bounds } = useMemo(() => {
    if (!rootPerson) return { nodes: [], connections: [], bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };

    const allNodes: TreeNode[] = [];
    const connections: { from: Position; to: Position; isSpouse?: boolean }[] = [];
    const processedIds = new Set<string>();

    // Calculate tree width for a subtree
    const calculateSubtreeWidth = (personId: string, generation: number, isAncestor: boolean): number => {
      if (generation > maxGenerations) return NODE_WIDTH;

      const person = getIndividual(personId);
      if (!person) return NODE_WIDTH;

      let width = NODE_WIDTH;

      // Add spouse width
      for (const familyId of person.familyAsSpouse) {
        const family = getFamily(familyId);
        if (family) {
          const spouseId = family.husband === personId ? family.wife : family.husband;
          if (spouseId) width += NODE_WIDTH + SPOUSE_SPACING;
        }
      }

      if (isAncestor) {
        // For ancestors, look at parents
        if (person.familyAsChild) {
          const family = getFamily(person.familyAsChild);
          if (family) {
            let parentWidth = 0;
            if (family.husband) parentWidth += calculateSubtreeWidth(family.husband, generation + 1, true);
            if (family.wife) parentWidth += calculateSubtreeWidth(family.wife, generation + 1, true) + HORIZONTAL_SPACING;
            width = Math.max(width, parentWidth);
          }
        }
      } else {
        // For descendants, look at children
        let childrenWidth = 0;
        for (const familyId of person.familyAsSpouse) {
          const family = getFamily(familyId);
          if (family) {
            for (const childId of family.children) {
              if (childrenWidth > 0) childrenWidth += HORIZONTAL_SPACING;
              childrenWidth += calculateSubtreeWidth(childId, generation + 1, false);
            }
          }
        }
        width = Math.max(width, childrenWidth);
      }

      return width;
    };

    // Position ancestors (going up)
    const positionAncestors = (personId: string, x: number, y: number, generation: number) => {
      if (generation > maxGenerations || processedIds.has(personId)) return;

      const person = getIndividual(personId);
      if (!person?.familyAsChild) return;

      const family = getFamily(person.familyAsChild);
      if (!family) return;

      const parentY = y - VERTICAL_SPACING;
      const parents: string[] = [];
      if (family.husband) parents.push(family.husband);
      if (family.wife) parents.push(family.wife);

      if (parents.length === 0) return;

      // Calculate total width needed for parents and their ancestors
      let totalWidth = 0;
      const parentWidths: number[] = [];

      for (const parentId of parents) {
        const width = calculateSubtreeWidth(parentId, generation + 1, true);
        parentWidths.push(width);
        totalWidth += width;
      }
      if (parents.length > 1) totalWidth += HORIZONTAL_SPACING;

      let currentX = x - totalWidth / 2;

      for (let i = 0; i < parents.length; i++) {
        const parentId = parents[i];
        if (processedIds.has(parentId)) continue;

        const parent = getIndividual(parentId);
        if (!parent) continue;

        const parentX = currentX + parentWidths[i] / 2;

        processedIds.add(parentId);
        allNodes.push({
          id: parentId,
          person: parent,
          x: parentX,
          y: parentY,
          children: []
        });

        // Connect to child
        connections.push({
          from: { x: parentX, y: parentY + NODE_HEIGHT / 2 },
          to: { x, y: y - NODE_HEIGHT / 2 }
        });

        // Recurse for grandparents
        positionAncestors(parentId, parentX, parentY, generation + 1);

        currentX += parentWidths[i] + HORIZONTAL_SPACING;
      }

      // Connect parents with spouse line
      if (parents.length === 2) {
        const p1 = allNodes.find(n => n.id === parents[0]);
        const p2 = allNodes.find(n => n.id === parents[1]);
        if (p1 && p2) {
          connections.push({
            from: { x: p1.x + NODE_WIDTH / 2, y: p1.y },
            to: { x: p2.x - NODE_WIDTH / 2, y: p2.y },
            isSpouse: true
          });
        }
      }
    };

    // Position descendants (going down)
    const positionDescendants = (personId: string, x: number, y: number, generation: number) => {
      if (generation > maxGenerations) return;

      const person = getIndividual(personId);
      if (!person) return;

      // Get all children from all marriages
      const allChildren: string[] = [];
      for (const familyId of person.familyAsSpouse) {
        const family = getFamily(familyId);
        if (family) {
          for (const childId of family.children) {
            if (!processedIds.has(childId) && !allChildren.includes(childId)) {
              allChildren.push(childId);
            }
          }
        }
      }

      if (allChildren.length === 0) return;

      const childY = y + VERTICAL_SPACING;

      // Calculate total width needed
      let totalWidth = 0;
      const childWidths: number[] = [];

      for (const childId of allChildren) {
        const width = calculateSubtreeWidth(childId, generation + 1, false);
        childWidths.push(width);
        totalWidth += width;
      }
      totalWidth += (allChildren.length - 1) * HORIZONTAL_SPACING;

      let currentX = x - totalWidth / 2;

      for (let i = 0; i < allChildren.length; i++) {
        const childId = allChildren[i];
        if (processedIds.has(childId)) continue;

        const child = getIndividual(childId);
        if (!child) continue;

        const childX = currentX + childWidths[i] / 2;

        processedIds.add(childId);
        allNodes.push({
          id: childId,
          person: child,
          x: childX,
          y: childY,
          children: []
        });

        // Connect from parent
        connections.push({
          from: { x, y: y + NODE_HEIGHT / 2 },
          to: { x: childX, y: childY - NODE_HEIGHT / 2 }
        });

        // Add spouse if exists
        for (const familyId of child.familyAsSpouse) {
          const family = getFamily(familyId);
          if (family) {
            const spouseId = family.husband === childId ? family.wife : family.husband;
            if (spouseId && !processedIds.has(spouseId)) {
              const spouse = getIndividual(spouseId);
              if (spouse) {
                processedIds.add(spouseId);
                const spouseX = childX + NODE_WIDTH + SPOUSE_SPACING;
                allNodes.push({
                  id: spouseId,
                  person: spouse,
                  x: spouseX,
                  y: childY,
                  children: [],
                  spouseId: childId
                });
                connections.push({
                  from: { x: childX + NODE_WIDTH / 2, y: childY },
                  to: { x: spouseX - NODE_WIDTH / 2, y: childY },
                  isSpouse: true
                });
              }
            }
          }
        }

        // Recurse for grandchildren
        positionDescendants(childId, childX, childY, generation + 1);

        currentX += childWidths[i] + HORIZONTAL_SPACING;
      }
    };

    // Position siblings
    const positionSiblings = (rootX: number, rootY: number) => {
      if (!rootPerson.familyAsChild) return;

      const family = getFamily(rootPerson.familyAsChild);
      if (!family) return;

      const siblings = family.children.filter(id => id !== rootPersonId && !processedIds.has(id));
      if (siblings.length === 0) return;

      // Position siblings to the left of root
      let currentX = rootX - (NODE_WIDTH + HORIZONTAL_SPACING);

      for (const siblingId of siblings) {
        const sibling = getIndividual(siblingId);
        if (!sibling || processedIds.has(siblingId)) continue;

        processedIds.add(siblingId);
        allNodes.push({
          id: siblingId,
          person: sibling,
          x: currentX,
          y: rootY,
          children: []
        });

        // Add spouse
        for (const familyId of sibling.familyAsSpouse) {
          const fam = getFamily(familyId);
          if (fam) {
            const spouseId = fam.husband === siblingId ? fam.wife : fam.husband;
            if (spouseId && !processedIds.has(spouseId)) {
              const spouse = getIndividual(spouseId);
              if (spouse) {
                processedIds.add(spouseId);
                const spouseX = currentX - NODE_WIDTH - SPOUSE_SPACING;
                allNodes.push({
                  id: spouseId,
                  person: spouse,
                  x: spouseX,
                  y: rootY,
                  children: [],
                  spouseId: siblingId
                });
                connections.push({
                  from: { x: currentX - NODE_WIDTH / 2, y: rootY },
                  to: { x: spouseX + NODE_WIDTH / 2, y: rootY },
                  isSpouse: true
                });
                currentX = spouseX;
              }
            }
          }
        }

        // Position sibling's children
        positionDescendants(siblingId, currentX + NODE_WIDTH / 2 + HORIZONTAL_SPACING / 2, rootY, 1);

        currentX -= (NODE_WIDTH + HORIZONTAL_SPACING);
      }
    };

    // Start with root person at center
    const rootX = 0;
    const rootY = 0;

    processedIds.add(rootPersonId);
    allNodes.push({
      id: rootPersonId,
      person: rootPerson,
      x: rootX,
      y: rootY,
      children: []
    });

    // Add root person's spouse(s)
    let spouseX = rootX + NODE_WIDTH + SPOUSE_SPACING;
    for (const familyId of rootPerson.familyAsSpouse) {
      const family = getFamily(familyId);
      if (family) {
        const spouseId = family.husband === rootPersonId ? family.wife : family.husband;
        if (spouseId && !processedIds.has(spouseId)) {
          const spouse = getIndividual(spouseId);
          if (spouse) {
            processedIds.add(spouseId);
            allNodes.push({
              id: spouseId,
              person: spouse,
              x: spouseX,
              y: rootY,
              children: [],
              spouseId: rootPersonId
            });
            connections.push({
              from: { x: rootX + NODE_WIDTH / 2, y: rootY },
              to: { x: spouseX - NODE_WIDTH / 2, y: rootY },
              isSpouse: true
            });
            spouseX += NODE_WIDTH + SPOUSE_SPACING;
          }
        }
      }
    }

    // Position ancestors (parents, grandparents, etc.)
    positionAncestors(rootPersonId, rootX, rootY, 1);

    // Position siblings
    positionSiblings(rootX, rootY);

    // Position descendants (children, grandchildren, etc.)
    positionDescendants(rootPersonId, rootX, rootY, 1);

    // Calculate bounds
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    for (const node of allNodes) {
      minX = Math.min(minX, node.x - NODE_WIDTH / 2);
      maxX = Math.max(maxX, node.x + NODE_WIDTH / 2);
      minY = Math.min(minY, node.y - NODE_HEIGHT / 2);
      maxY = Math.max(maxY, node.y + NODE_HEIGHT / 2);
    }

    return {
      nodes: allNodes,
      connections,
      bounds: { minX, maxX, minY, maxY }
    };
  }, [rootPersonId, rootPerson, maxGenerations, getIndividual, getFamily]);

  // Center tree on load
  useEffect(() => {
    if (containerRef.current && bounds) {
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;

      const treeWidth = bounds.maxX - bounds.minX + 100;
      const treeHeight = bounds.maxY - bounds.minY + 100;

      // Calculate zoom to fit
      const zoomToFit = Math.min(
        containerWidth / treeWidth,
        containerHeight / treeHeight,
        1
      );

      setZoom(Math.max(0.3, zoomToFit));
      setPan({
        x: containerWidth / 2,
        y: containerHeight / 2 - bounds.minY * zoomToFit
      });
    }
  }, [bounds, rootPersonId]);

  // Handle mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(Math.max(z * delta, 0.2), 3));
  }, []);

  // Handle pan start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  // Handle pan move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  }, [isDragging, dragStart]);

  // Handle pan end
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch handlers for mobile
  const [touchStart, setTouchStart] = useState<Position | null>(null);
  const [initialPinchDistance, setInitialPinchDistance] = useState<number | null>(null);
  const [initialZoom, setInitialZoom] = useState(1);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setTouchStart({ x: e.touches[0].clientX - pan.x, y: e.touches[0].clientY - pan.y });
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      setInitialPinchDistance(Math.sqrt(dx * dx + dy * dy));
      setInitialZoom(zoom);
    }
  }, [pan, zoom]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1 && touchStart) {
      setPan({
        x: e.touches[0].clientX - touchStart.x,
        y: e.touches[0].clientY - touchStart.y
      });
    } else if (e.touches.length === 2 && initialPinchDistance) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const scale = distance / initialPinchDistance;
      setZoom(Math.min(Math.max(initialZoom * scale, 0.2), 3));
    }
  }, [touchStart, initialPinchDistance, initialZoom]);

  const handleTouchEnd = useCallback(() => {
    setTouchStart(null);
    setInitialPinchDistance(null);
  }, []);

  const handlePersonClick = useCallback((personId: string) => {
    onPersonSelect?.(personId);
  }, [onPersonSelect]);

  const handleViewAs = useCallback((personId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRootPersonId(personId);
  }, [setRootPersonId]);

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
      <div className="flex-shrink-0 p-3 sm:p-4 flex flex-wrap gap-3 items-center justify-center border-b border-warm-200 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom(z => Math.min(z * 1.2, 3))}
            className="w-9 h-9 flex items-center justify-center bg-white border border-warm-300 rounded-lg hover:bg-warm-50 text-warm-700 font-bold"
          >
            +
          </button>
          <span className="text-sm text-warm-600 w-14 text-center">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(z => Math.max(z * 0.8, 0.2))}
            className="w-9 h-9 flex items-center justify-center bg-white border border-warm-300 rounded-lg hover:bg-warm-50 text-warm-700 font-bold"
          >
            -
          </button>
        </div>

        <button
          onClick={() => {
            if (containerRef.current) {
              const containerWidth = containerRef.current.clientWidth;
              const containerHeight = containerRef.current.clientHeight;
              setZoom(0.6);
              setPan({ x: containerWidth / 2, y: containerHeight / 2 });
            }
          }}
          className="px-3 py-2 bg-white border border-warm-300 rounded-lg hover:bg-warm-50 text-sm text-warm-700"
        >
          Reset View
        </button>

        <label className="flex items-center gap-2 text-sm text-warm-600">
          <span>Generations:</span>
          <input
            type="number"
            min={1}
            max={5}
            value={maxGenerations}
            onChange={(e) => setMaxGenerations(parseInt(e.target.value) || 3)}
            className="w-14 px-2 py-2 border border-warm-300 rounded-lg text-center focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </label>
      </div>

      {/* Tree Canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
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
          ref={contentRef}
          className="relative"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            willChange: 'transform'
          }}
        >
          {/* Connection Lines */}
          <svg
            className="absolute pointer-events-none"
            style={{
              left: bounds.minX - 50,
              top: bounds.minY - 50,
              width: bounds.maxX - bounds.minX + 100,
              height: bounds.maxY - bounds.minY + 100,
              overflow: 'visible'
            }}
          >
            {connections.map((conn, idx) => (
              <path
                key={idx}
                d={conn.isSpouse
                  ? `M ${conn.from.x - bounds.minX + 50} ${conn.from.y - bounds.minY + 50} L ${conn.to.x - bounds.minX + 50} ${conn.to.y - bounds.minY + 50}`
                  : `M ${conn.from.x - bounds.minX + 50} ${conn.from.y - bounds.minY + 50}
                     C ${conn.from.x - bounds.minX + 50} ${(conn.from.y + conn.to.y) / 2 - bounds.minY + 50},
                       ${conn.to.x - bounds.minX + 50} ${(conn.from.y + conn.to.y) / 2 - bounds.minY + 50},
                       ${conn.to.x - bounds.minX + 50} ${conn.to.y - bounds.minY + 50}`
                }
                fill="none"
                stroke={conn.isSpouse ? '#dd6b5b' : '#a8a29e'}
                strokeWidth={conn.isSpouse ? 3 : 2}
                strokeDasharray={conn.isSpouse ? '6,4' : 'none'}
              />
            ))}
          </svg>

          {/* Person Nodes */}
          {nodes.map((node) => {
            const isRoot = node.id === rootPersonId;
            const isSelected = selectedPersonId === node.id;
            const relationship = getRelationshipWithChain(rootPersonId, node.id);
            const primaryPhoto = node.person.photos.find(p => p.isPrimary) || node.person.photos[0];
            const isDeceased = !!node.person.death;

            return (
              <div
                key={node.id}
                className={`
                  absolute p-2.5 bg-white rounded-xl shadow-md border-2 cursor-pointer
                  transition-all duration-150 hover:shadow-lg hover:scale-105
                  ${isRoot ? 'border-primary-500 ring-2 ring-primary-200 shadow-lg' : 'border-warm-200'}
                  ${isSelected ? 'ring-2 ring-accent-400' : ''}
                  ${isDeceased ? 'bg-warm-50/90' : ''}
                `}
                style={{
                  left: node.x - NODE_WIDTH / 2,
                  top: node.y - NODE_HEIGHT / 2,
                  width: NODE_WIDTH,
                  height: NODE_HEIGHT
                }}
                onClick={() => handlePersonClick(node.id)}
              >
                <div className="flex items-start gap-2 h-full">
                  {/* Photo */}
                  <div className="flex-shrink-0">
                    {primaryPhoto ? (
                      <img
                        src={primaryPhoto.url}
                        alt={node.person.name.full}
                        className="w-10 h-10 rounded-full object-cover border-2 border-warm-200"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          target.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div className={`${primaryPhoto ? 'hidden' : ''} w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                      node.person.sex === 'M'
                        ? 'bg-amber-100 text-amber-700'
                        : node.person.sex === 'F'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-warm-200 text-warm-600'
                    }`}>
                      {node.person.name.given[0] || '?'}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 flex flex-col">
                    <p className="font-semibold text-warm-800 text-sm truncate leading-tight">
                      {node.person.name.given}
                    </p>
                    <p className="text-xs text-warm-500 truncate">
                      {node.person.name.surname}
                    </p>
                    <p className="text-xs text-primary-600 font-medium mt-auto truncate">
                      {isRoot ? 'You' : relationship}
                    </p>
                  </div>
                </div>

                {/* View As Button */}
                {!isRoot && (
                  <button
                    onClick={(e) => handleViewAs(node.id, e)}
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 text-xs bg-primary-500 hover:bg-primary-600 text-white rounded-full font-medium shadow-md opacity-0 hover:opacity-100 transition-opacity group-hover:opacity-100"
                    style={{ opacity: isSelected ? 1 : undefined }}
                  >
                    View
                  </button>
                )}

                {/* Gender indicator */}
                <div className={`
                  absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs flex items-center justify-center font-medium border-2 border-white shadow-sm
                  ${node.person.sex === 'M'
                    ? 'bg-amber-100 text-amber-700'
                    : node.person.sex === 'F'
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-warm-200 text-warm-600'}
                `}>
                  {node.person.sex === 'M' ? '♂' : node.person.sex === 'F' ? '♀' : '?'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Instructions */}
      <div className="flex-shrink-0 p-2 text-center text-xs text-warm-500 bg-white/80 border-t border-warm-200">
        Drag to pan • Scroll/pinch to zoom • Tap person for details
      </div>
    </div>
  );
}

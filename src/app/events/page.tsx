'use client';

import React, { useMemo } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Header } from '@/components/ui/Header';
import { useFamilyTree } from '@/contexts/FamilyTreeContext';
import { format, parseISO, isAfter, isBefore, addDays, setYear } from 'date-fns';

interface UpcomingEvent {
  personId: string;
  personName: string;
  eventType: 'birthday' | 'anniversary' | 'memorial';
  date: Date;
  originalDate: string;
  age?: number;
  yearsAgo?: number;
}

export default function EventsPage() {
  const { data, getRelationship, rootPersonId, setRootPersonId } = useFamilyTree();

  const events = useMemo(() => {
    const upcoming: UpcomingEvent[] = [];
    const today = new Date();
    const currentYear = today.getFullYear();
    const endDate = addDays(today, 365);

    // Birthdays and Memorials
    Object.values(data.individuals).forEach((person) => {
      if (person.birth?.date) {
        try {
          const birthDate = parseISO(person.birth.date);
          const thisYearBirthday = setYear(birthDate, currentYear);
          const nextYearBirthday = setYear(birthDate, currentYear + 1);

          const eventDate = isAfter(thisYearBirthday, today) ? thisYearBirthday : nextYearBirthday;

          if (isBefore(eventDate, endDate)) {
            const age = eventDate.getFullYear() - birthDate.getFullYear();

            if (person.death) {
              upcoming.push({
                personId: person.id,
                personName: person.name.full,
                eventType: 'memorial',
                date: eventDate,
                originalDate: person.birth.date,
                yearsAgo: age
              });
            } else {
              upcoming.push({
                personId: person.id,
                personName: person.name.full,
                eventType: 'birthday',
                date: eventDate,
                originalDate: person.birth.date,
                age
              });
            }
          }
        } catch (e) {
          // Skip invalid dates
        }
      }
    });

    // Anniversaries
    Object.values(data.families).forEach((family) => {
      if (family.marriage?.date && family.husband && family.wife) {
        try {
          const marriageDate = parseISO(family.marriage.date);
          const husband = data.individuals[family.husband];
          const wife = data.individuals[family.wife];

          if (husband && wife && !husband.death && !wife.death) {
            const thisYearAnniv = setYear(marriageDate, currentYear);
            const nextYearAnniv = setYear(marriageDate, currentYear + 1);

            const eventDate = isAfter(thisYearAnniv, today) ? thisYearAnniv : nextYearAnniv;

            if (isBefore(eventDate, endDate)) {
              upcoming.push({
                personId: family.husband,
                personName: `${husband.name.given} & ${wife.name.given}`,
                eventType: 'anniversary',
                date: eventDate,
                originalDate: family.marriage.date,
                yearsAgo: eventDate.getFullYear() - marriageDate.getFullYear()
              });
            }
          }
        } catch (e) {
          // Skip invalid dates
        }
      }
    });

    return upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [data]);

  const groupedEvents = useMemo(() => {
    const groups: Record<string, UpcomingEvent[]> = {};

    events.forEach((event) => {
      const month = format(event.date, 'MMMM yyyy');
      if (!groups[month]) groups[month] = [];
      groups[month].push(event);
    });

    return groups;
  }, [events]);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'birthday': return '🎂';
      case 'anniversary': return '💑';
      case 'memorial': return '🕯️';
      default: return '📅';
    }
  };

  const getEventBgColor = (type: string) => {
    switch (type) {
      case 'birthday': return 'bg-primary-100';
      case 'anniversary': return 'bg-accent-100';
      case 'memorial': return 'bg-warm-200';
      default: return 'bg-warm-100';
    }
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-warm-50">
        <Header />

        <main className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
          <h1 className="text-2xl font-bold text-warm-800 mb-6">Upcoming Events</h1>

          {Object.keys(groupedEvents).length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-warm-200 p-8 text-center">
              <p className="text-warm-500">No upcoming events found</p>
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedEvents).map(([month, monthEvents]) => (
                <div key={month}>
                  <h2 className="text-sm font-semibold text-accent-600 mb-3 uppercase tracking-wide sticky top-14 bg-warm-50 py-2 z-10">
                    {month}
                  </h2>

                  <div className="space-y-3">
                    {monthEvents.map((event, idx) => (
                      <div
                        key={`${event.personId}-${event.eventType}-${idx}`}
                        className="bg-white rounded-xl shadow-sm border border-warm-200 p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`
                            w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0
                            ${getEventBgColor(event.eventType)}
                          `}>
                            {getEventIcon(event.eventType)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <button
                              onClick={() => setRootPersonId(event.personId)}
                              className="font-semibold text-warm-800 hover:text-primary-600 transition-colors text-left truncate block w-full"
                            >
                              {event.personName}
                            </button>
                            <p className="text-sm text-warm-500">
                              {event.eventType === 'birthday' && `Turns ${event.age}`}
                              {event.eventType === 'anniversary' && `${event.yearsAgo} years married`}
                              {event.eventType === 'memorial' && `Would be ${event.yearsAgo}`}
                            </p>
                            <p className="text-xs text-warm-400 mt-0.5">
                              {getRelationship(rootPersonId, event.personId)}
                            </p>
                          </div>

                          <div className="text-right flex-shrink-0">
                            <p className="font-bold text-xl text-warm-800">
                              {format(event.date, 'd')}
                            </p>
                            <p className="text-sm text-warm-500">
                              {format(event.date, 'EEE')}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}

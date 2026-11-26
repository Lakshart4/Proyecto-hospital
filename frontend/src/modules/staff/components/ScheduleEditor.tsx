import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { FormField, INPUT_CLASSES } from '../../../shared/components/FormField';
import { Toast } from '../../../shared/components/Toast';
import { isApiError, toApiError } from '../../../shared/lib/apiClient';
import { MESSAGES } from '../../../shared/lib/messages';
import { replaceSchedule } from '../api';
import type { ScheduleBreak, WorkDay } from '../types';

interface DayState {
  enabled: boolean;
  startTime: string;
  endTime: string;
  mealStart: string;
  mealEnd: string;
  breaks: ScheduleBreak[];
}

const DEFAULT_DAY: DayState = {
  enabled: false,
  startTime: '08:00',
  endTime: '16:00',
  mealStart: '',
  mealEnd: '',
  breaks: [],
};

function toDayStates(schedule: readonly WorkDay[]): DayState[] {
  return Array.from({ length: 7 }, (_, day) => {
    const found = schedule.find((s) => s.dayOfWeek === day);
    if (!found) return { ...DEFAULT_DAY, breaks: [] };
    return {
      enabled: true,
      startTime: found.startTime,
      endTime: found.endTime,
      mealStart: found.mealStart ?? '',
      mealEnd: found.mealEnd ?? '',
      breaks: found.breaks.map((b) => ({ ...b })),
    };
  });
}

export interface ScheduleEditorProps {
  userId: number;
  schedule: readonly WorkDay[];
  onSaved: (next: WorkDay[]) => void;
}

/** Editor semanal del Horario_de_Trabajo (Req. 5.7, 5.15, 5.16). */
export function ScheduleEditor({ userId, schedule, onSaved }: ScheduleEditorProps) {
  const [days, setDays] = useState<DayState[]>(() => toDayStates(schedule));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setDays(toDayStates(schedule));
  }, [schedule]);

  const updateDay = (dayIndex: number, updater: (prev: DayState) => DayState) => {
    setDays((prev) => prev.map((item, idx) => (idx === dayIndex ? updater(item) : item)));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;

    const payload: WorkDay[] = [];
    const activeDayIndexes: number[] = [];
    days.forEach((day, dayOfWeek) => {
      if (!day.enabled) return;
      activeDayIndexes.push(dayOfWeek);
      payload.push({
        dayOfWeek,
        startTime: day.startTime,
        endTime: day.endTime,
        mealStart: day.mealStart.trim() === '' ? null : day.mealStart.trim(),
        mealEnd: day.mealEnd.trim() === '' ? null : day.mealEnd.trim(),
        breaks: day.breaks.map((b) => ({ startTime: b.startTime, endTime: b.endTime })),
      });
    });

    setFieldErrors({});
    setFormError(null);
    setSaving(true);
    try {
      const saved = await replaceSchedule(userId, payload);
      onSaved(saved);
      setToast(MESSAGES.staff.scheduleSaved);
    } catch (error) {
      const apiError = toApiError(error);
      if (isApiError(apiError) && apiError.status === 400 && apiError.errors.length > 0) {
        const mapped: Record<string, string> = {};
        for (const item of apiError.errors) {
          const match = /^days\.(\d+)\.(.+)$/.exec(item.field);
          if (match) {
            const dayIdx = activeDayIndexes[Number(match[1])];
            if (dayIdx !== undefined) {
              mapped[`${dayIdx}.${match[2]}`] = item.message;
              continue;
            }
          }
          mapped[item.field] = item.message;
        }
        setFieldErrors(mapped);
        setFormError(apiError.message);
      } else {
        setFormError(apiError.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-heading">{MESSAGES.staff.scheduleTitle}</h2>
        <Button type="submit" loading={saving}>
          {MESSAGES.staff.saveSchedule}
        </Button>
      </div>
      {formError && <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />}
      {toast && <Toast message={toast} tone="success" onClose={() => setToast(null)} />}

      <div className="grid grid-cols-1 gap-4">
        {days.map((day, dayIndex) => {
          const dayName = MESSAGES.staff.days[dayIndex] ?? '';
          const dayError = fieldErrors[`${dayIndex}.breaks`] ?? fieldErrors[`${dayIndex}.dayOfWeek`];
          return (
            <div key={dayIndex} className="rounded-lg border border-border bg-page p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                  <input
                    type="checkbox"
                    checked={day.enabled}
                    onChange={(e) => updateDay(dayIndex, (prev) => ({ ...prev, enabled: e.target.checked }))}
                    disabled={saving}
                    className="h-4 w-4 accent-primary"
                  />
                  {dayName}
                </label>
                {day.enabled && day.breaks.length < 3 && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      updateDay(dayIndex, (prev) => ({
                        ...prev,
                        breaks: [...prev.breaks, { startTime: '10:00', endTime: '10:15' }],
                      }))
                    }
                    disabled={saving}
                  >
                    {MESSAGES.staff.addBreak}
                  </Button>
                )}
              </div>

              {day.enabled && (
                <div className="mt-3 flex flex-col gap-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <FormField id={`sch-${dayIndex}-start`} label={MESSAGES.staff.startTime} error={fieldErrors[`${dayIndex}.startTime`]} required>
                      <input
                        type="time"
                        value={day.startTime}
                        onChange={(e) => updateDay(dayIndex, (p) => ({ ...p, startTime: e.target.value }))}
                        disabled={saving}
                        className={INPUT_CLASSES}
                      />
                    </FormField>
                    <FormField id={`sch-${dayIndex}-end`} label={MESSAGES.staff.endTime} error={fieldErrors[`${dayIndex}.endTime`]} required>
                      <input
                        type="time"
                        value={day.endTime}
                        onChange={(e) => updateDay(dayIndex, (p) => ({ ...p, endTime: e.target.value }))}
                        disabled={saving}
                        className={INPUT_CLASSES}
                      />
                    </FormField>
                    <FormField id={`sch-${dayIndex}-mealStart`} label={MESSAGES.staff.mealStart} error={fieldErrors[`${dayIndex}.mealStart`]}>
                      <input
                        type="time"
                        value={day.mealStart}
                        onChange={(e) => updateDay(dayIndex, (p) => ({ ...p, mealStart: e.target.value }))}
                        disabled={saving}
                        className={INPUT_CLASSES}
                      />
                    </FormField>
                    <FormField id={`sch-${dayIndex}-mealEnd`} label={MESSAGES.staff.mealEnd} error={fieldErrors[`${dayIndex}.mealEnd`]}>
                      <input
                        type="time"
                        value={day.mealEnd}
                        onChange={(e) => updateDay(dayIndex, (p) => ({ ...p, mealEnd: e.target.value }))}
                        disabled={saving}
                        className={INPUT_CLASSES}
                      />
                    </FormField>
                  </div>

                  {dayError && <p className="text-sm text-status-danger-fg">{dayError}</p>}

                  {day.breaks.length > 0 && (
                    <div className="flex flex-col gap-2 border-t border-border pt-3">
                      <p className="text-xs font-medium text-muted">{MESSAGES.staff.breaks}</p>
                      {day.breaks.map((brk, breakIndex) => {
                        const brkError = fieldErrors[`${dayIndex}.breaks.${breakIndex}`];
                        return (
                          <div key={breakIndex} className="flex flex-col gap-1">
                            <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-3">
                              <FormField
                                id={`sch-${dayIndex}-brk-${breakIndex}-start`}
                                label={`${MESSAGES.staff.breaks} ${breakIndex + 1} (${MESSAGES.staff.startTime})`}
                                error={fieldErrors[`${dayIndex}.breaks.${breakIndex}.startTime`]}
                              >
                                <input
                                  type="time"
                                  value={brk.startTime}
                                  onChange={(e) =>
                                    updateDay(dayIndex, (p) => ({
                                      ...p,
                                      breaks: p.breaks.map((item, idx) => (idx === breakIndex ? { ...item, startTime: e.target.value } : item)),
                                    }))
                                  }
                                  disabled={saving}
                                  className={INPUT_CLASSES}
                                />
                              </FormField>
                              <FormField
                                id={`sch-${dayIndex}-brk-${breakIndex}-end`}
                                label={`${MESSAGES.staff.breaks} ${breakIndex + 1} (${MESSAGES.staff.endTime})`}
                                error={fieldErrors[`${dayIndex}.breaks.${breakIndex}.endTime`]}
                              >
                                <input
                                  type="time"
                                  value={brk.endTime}
                                  onChange={(e) =>
                                    updateDay(dayIndex, (p) => ({
                                      ...p,
                                      breaks: p.breaks.map((item, idx) => (idx === breakIndex ? { ...item, endTime: e.target.value } : item)),
                                    }))
                                  }
                                  disabled={saving}
                                  className={INPUT_CLASSES}
                                />
                              </FormField>
                              <div>
                                <Button
                                  variant="secondary"
                                  onClick={() =>
                                    updateDay(dayIndex, (p) => ({
                                      ...p,
                                      breaks: p.breaks.filter((_, idx) => idx !== breakIndex),
                                    }))
                                  }
                                  disabled={saving}
                                >
                                  {MESSAGES.staff.removeBreak}
                                </Button>
                              </div>
                            </div>
                            {brkError && <p className="text-sm text-status-danger-fg">{brkError}</p>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </form>
  );
}

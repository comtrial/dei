import { useEffect, useRef, useState } from 'react';

import { getCurrentHourSlotKst } from '@dei/shared';

export function useHourSlot(): { currentHour: number; setCurrentHour: (h: number) => void } {
  const [currentHour, setCurrentHour] = useState<number>(getCurrentHourSlotKst);
  const lastKstHourRef = useRef<number>(currentHour);

  useEffect(() => {
    const id = setInterval(() => {
      const nowHour = getCurrentHourSlotKst();
      if (nowHour !== lastKstHourRef.current) {
        lastKstHourRef.current = nowHour;
        setCurrentHour(nowHour);
      }
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  return { currentHour, setCurrentHour };
}

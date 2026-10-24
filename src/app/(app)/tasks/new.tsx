import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';

import { Screen, toast } from '@/components';
import { TaskForm, toFormValues, toTaskInput } from '@/features/tasks/components/TaskForm';
import { createTask } from '@/features/tasks/taskService';

export default function NewTask() {
  const params = useLocalSearchParams<{ listId?: string; date?: string }>();
  const initial = useMemo(() => {
    let due: Date | undefined;
    if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
      const [y, m, d] = params.date.split('-').map(Number);
      due = new Date(y!, m! - 1, d!, 9, 0, 0, 0);
    }
    return toFormValues(null, { listId: params.listId, due });
  }, [params.listId, params.date]);

  return (
    <Screen title="New task" back keyboard>
      <TaskForm
        initial={initial}
        submitLabel="Add task"
        onSubmit={async (v) => {
          try {
            await createTask(toTaskInput(v));
            router.back();
          } catch (e) {
            toast.error(e);
          }
        }}
      />
    </Screen>
  );
}

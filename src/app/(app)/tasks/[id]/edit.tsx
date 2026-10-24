import { router, useLocalSearchParams } from 'expo-router';

import { EmptyState, Screen, SkeletonList, toast } from '@/components';
import { TaskForm, toFormValues, toTaskInput } from '@/features/tasks/components/TaskForm';
import { updateTask } from '@/features/tasks/taskService';
import { useTask } from '@/hooks/queries';

export default function EditTask() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const task = useTask(id);

  return (
    <Screen title="Edit task" back keyboard>
      {task.isLoading ? (
        <SkeletonList rows={3} />
      ) : !task.data ? (
        <EmptyState title="Task not found" body="It may have been deleted on another device." mood="error" actionLabel="Back" onAction={() => router.back()} />
      ) : (
        <TaskForm
          key={task.data.id}
          initial={toFormValues(task.data)}
          submitLabel="Save changes"
          onSubmit={async (v) => {
            try {
              await updateTask(task.data!.id, toTaskInput(v));
              toast.success('Saved');
              router.back();
            } catch (e) {
              toast.error(e);
            }
          }}
        />
      )}
    </Screen>
  );
}

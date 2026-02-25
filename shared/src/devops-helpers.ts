type TaskLibBridge = {
  getInput: (name: string, required?: boolean) => string | undefined;
  getVariable: (name: string) => string | undefined;
};

function getTaskLibBridge(): TaskLibBridge {
  return require('azure-pipelines-task-lib/task') as TaskLibBridge;
}

export function requireInput(name: string): string {
  const taskLib = getTaskLibBridge();
  const value = taskLib.getInput(name, true);
  if (!value) {
    throw new Error(`Task input ${name} is required.`);
  }

  return value.trim();
}

export function requireVariable(name: string): string {
  const taskLib = getTaskLibBridge();
  const value = taskLib.getVariable(name);
  if (!value) {
    throw new Error(`Missing required pipeline variable: ${name}.`);
  }

  return value.trim();
}
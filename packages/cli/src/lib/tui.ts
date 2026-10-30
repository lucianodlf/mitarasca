import { emitKeypressEvents } from "node:readline";

export type Choice = { label: string; value: string };

export function isInteractive(): boolean {
  return Boolean(
    process.stdin.isTTY && process.stdout.isTTY && typeof process.stdin.setRawMode === "function"
  );
}

function renderRadio(choices: Choice[], selected: number): string[] {
  return choices.map((c, i) => `${i === selected ? "❯" : " "} ${c.label}`);
}

function renderCheckbox(choices: Choice[], selected: number, checked: Set<number>): string[] {
  return choices.map((c, i) => {
    const cursor = i === selected ? "❯" : " ";
    const box = checked.has(i) ? "[x]" : "[ ]";
    return `${cursor} ${box} ${c.label}`;
  });
}

function redraw(lines: string[], previousLineCount: number): void {
  if (previousLineCount > 0) {
    process.stdout.write(`\x1b[${previousLineCount}A`);
  }
  for (const line of lines) {
    process.stdout.write(`\x1b[2K\r${line}\n`);
  }
}

async function withKeypressSession<T>(
  message: string,
  run: (finish: (result: T) => void, redrawNow: () => void) => { render: () => string[] }
): Promise<T> {
  return new Promise((resolve, reject) => {
    console.log(message);
    process.stdout.write("\x1b[?25l");
    emitKeypressEvents(process.stdin);
    const wasRaw = process.stdin.isRaw ?? false;
    process.stdin.setRawMode(true);
    process.stdin.resume();

    let lineCount = 0;
    const cleanup = () => {
      process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
      process.stdout.write("\x1b[?25h");
      process.stdin.removeAllListeners("keypress");
    };

    const finish = (result: T) => {
      cleanup();
      resolve(result);
    };

    const redrawNow = () => {
      const lines = controller.render();
      redraw(lines, lineCount);
      lineCount = lines.length;
    };

    // ponytail: Ctrl+C se maneja acá porque run() registra su propio listener de
    // keypress para mutar estado + redibujar; este listener solo cubre la salida.
    process.stdin.on("keypress", (_str, key) => {
      if (key?.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("Cancelado por el usuario (Ctrl+C)"));
      }
    });

    const controller = run(finish, redrawNow);
    const initial = controller.render();
    redraw(initial, 0);
    lineCount = initial.length;
  });
}

export async function promptRadio(message: string, choices: Choice[]): Promise<string> {
  if (!isInteractive()) {
    console.log(message);
    choices.forEach((c, i) => console.log(`  ${i + 1}) ${c.label}`));
    const answer = prompt("Elegí un número: ");
    const idx = Number(answer) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= choices.length) {
      throw new Error(`Selección inválida: "${answer}"`);
    }
    return choices[idx]!.value;
  }

  let selected = 0;
  return withKeypressSession<string>(message, (finish, redrawNow) => {
    const controller = {
      render: () => renderRadio(choices, selected),
    };
    process.stdin.on("keypress", (_str, key) => {
      if (key?.name === "up") selected = Math.max(0, selected - 1);
      else if (key?.name === "down") selected = Math.min(choices.length - 1, selected + 1);
      else if (key?.name === "return") {
        finish(choices[selected]!.value);
        return;
      } else {
        return;
      }
      redrawNow();
    });
    return controller;
  });
}

export async function promptCheckbox(
  message: string,
  choices: Choice[],
  preselected: string[] = []
): Promise<string[]> {
  if (!isInteractive()) {
    console.log(message);
    choices.forEach((c, i) => console.log(`  ${i + 1}) ${c.label}`));
    const answer = prompt("Elegí números separados por coma: ") ?? "";
    const indices = answer
      .split(",")
      .map((s) => Number(s.trim()) - 1)
      .filter((i) => Number.isInteger(i) && i >= 0 && i < choices.length);
    return indices.map((i) => choices[i]!.value);
  }

  let selected = 0;
  const checked = new Set<number>(
    choices.map((c, i) => (preselected.includes(c.value) ? i : -1)).filter((i) => i >= 0)
  );
  return withKeypressSession<string[]>(message, (finish, redrawNow) => {
    const controller = {
      render: () => renderCheckbox(choices, selected, checked),
    };
    process.stdin.on("keypress", (_str, key) => {
      if (key?.name === "up") selected = Math.max(0, selected - 1);
      else if (key?.name === "down") selected = Math.min(choices.length - 1, selected + 1);
      else if (key?.name === "space") {
        if (checked.has(selected)) checked.delete(selected);
        else checked.add(selected);
      } else if (key?.name === "return") {
        finish([...checked].sort((a, b) => a - b).map((i) => choices[i]!.value));
        return;
      } else {
        return;
      }
      redrawNow();
    });
    return controller;
  });
}

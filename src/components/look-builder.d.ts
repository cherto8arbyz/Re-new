export class LookBuilder {
  constructor(
    container: HTMLElement,
    store: any,
    options: { onSelectionChange: (itemIds: string[]) => void },
  );

  setSelection(itemIds: string[]): void;
  destroy(): void;
}

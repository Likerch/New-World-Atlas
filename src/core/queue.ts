// A binary min-heap keyed by priority: the frontier for expansions (cultures, states), path-finding and pit filling.

export class PriorityQueue<T> {
  private items: T[] = [];
  private priorities: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: T, priority: number): void {
    const items = this.items;
    const priorities = this.priorities;
    let index = items.length;
    items.push(item);
    priorities.push(priority);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (priorities[parent] <= priority) break;
      items[index] = items[parent];
      priorities[index] = priorities[parent];
      index = parent;
    }
    items[index] = item;
    priorities[index] = priority;
  }

  /** The item with the lowest priority, and that priority. */
  pop(): [T, number] | undefined {
    const items = this.items;
    const priorities = this.priorities;
    if (!items.length) return undefined;
    const top: [T, number] = [items[0], priorities[0]];
    const lastItem = items.pop()!;
    const lastPriority = priorities.pop()!;
    if (items.length) {
      let index = 0;
      const half = items.length >> 1;
      while (index < half) {
        let child = 2 * index + 1;
        if (child + 1 < items.length && priorities[child + 1] < priorities[child]) child++;
        if (priorities[child] >= lastPriority) break;
        items[index] = items[child];
        priorities[index] = priorities[child];
        index = child;
      }
      items[index] = lastItem;
      priorities[index] = lastPriority;
    }
    return top;
  }
}

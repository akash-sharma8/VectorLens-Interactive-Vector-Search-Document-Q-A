export class Heap<T> {
  private data: T[] = [];

  constructor(private compare: (a: T, b: T) => number) {}

  get size() {
    return this.data.length;
  }

  peek() {
    return this.data[0];
  }

  push(value: T) {
    const a = this.data;

    a.push(value);

    let i = a.length - 1;

    while (i > 0) {
      const p = (i - 1) >> 1;

      if (this.compare(a[i], a[p]) >= 0) {
        break;
      }

      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }

  pop(): T | undefined {
    const a = this.data;

    if (!a.length) {
      return undefined;
    }

    const first = a[0];
    const last = a.pop()!;

    if (a.length) {
      a[0] = last;

      let i = 0;

      while (true) {
        let n = i;
        const l = 2 * i + 1;
        const r = l + 1;

        if (l < a.length && this.compare(a[l], a[n]) < 0) {
          n = l;
        }

        if (r < a.length && this.compare(a[r], a[n]) < 0) {
          n = r;
        }

        if (n === i) {
          break;
        }

        [a[i], a[n]] = [a[n], a[i]];
        i = n;
      }
    }

    return first;
  }

  values() {
    return [...this.data];
  }
}

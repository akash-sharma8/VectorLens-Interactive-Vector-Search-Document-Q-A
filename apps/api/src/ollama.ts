import { z } from 'zod';

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export interface ModelStatus {
  available: boolean;
  missingModels: string[];
}

export interface AIProvider {
  embedModel: string;
  genModel: string;
  status(): Promise<ModelStatus>;
  embed(text: string): Promise<number[]>;
  generate(prompt: string): Promise<string>;
}

export class OllamaClient implements AIProvider {
  constructor(
    readonly baseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
    readonly embedModel = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
    readonly genModel = process.env.OLLAMA_GEN_MODEL || 'llama3.2',
  ) {}

  private async request(path: string, body?: unknown, timeout = 30000): Promise<unknown> {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeout),
      });
    } catch {
      throw new ApiError(
        'Cannot reach Ollama or request timed out. Check that Ollama is running.',
        503,
      );
    }

    let data: unknown;

    try {
      data = await response.json();
    } catch {
      throw new ApiError('Ollama returned invalid JSON.', 502);
    }

    if (!response.ok) {
      const error = z
        .object({
          error: z.string(),
        })
        .safeParse(data);

      throw new ApiError(
        error.success ? `Ollama: ${error.data.error}` : 'Ollama request failed.',
        502,
      );
    }

    return data;
  }

  async status(): Promise<ModelStatus> {
    try {
      const data = z
        .object({
          models: z.array(
            z.object({
              name: z.string(),
            }),
          ),
        })
        .parse(await this.request('/api/tags', undefined, 2000));

      const names = data.models.map((m) => m.name);

      const normalize = (name: string) => (name.includes(':') ? name : `${name}:latest`);

      return {
        available: true,
        missingModels: [this.embedModel, this.genModel].filter(
          (model) => !names.some((name) => normalize(name) === normalize(model)),
        ),
      };
    } catch {
      return {
        available: false,
        missingModels: [this.embedModel, this.genModel],
      };
    }
  }

  async embed(text: string) {
    const data = z
      .object({
        embeddings: z.array(z.array(z.number().finite()).min(1)).min(1),
      })
      .safeParse(
        await this.request(
          '/api/embed',
          {
            model: this.embedModel,
            input: text,
            truncate: false,
          },
          60000,
        ),
      );

    if (!data.success) {
      throw new ApiError('Ollama returned an invalid embedding.', 502);
    }

    return data.data.embeddings[0];
  }

  async generate(prompt: string) {
    const data = z
      .object({
        response: z.string().min(1),
      })
      .safeParse(
        await this.request(
          '/api/generate',
          {
            model: this.genModel,
            prompt,
            stream: false,
          },
          180000,
        ),
      );

    if (!data.success) {
      throw new ApiError('Ollama returned an empty or invalid answer.', 502);
    }

    return data.data.response;
  }
}

import {
  InteractionResponseType,
  ComponentType,
  TextInputStyle,
  type APIApplicationCommandInteraction,
  type APIInteractionResponse,
} from "discord-api-types/v10";
import type { Env } from "../types.ts";
import { getChapters } from "../services/member.ts";

export async function handleRegisterCommand(
  _interaction: APIApplicationCommandInteraction,
  env: Env
): Promise<APIInteractionResponse> {
  // Fetch chapters dynamically from D1
  const chapters = await getChapters(env.SPARK_DB);

  // Map chapters into select options
  const chapterOptions = chapters.map((c) => {
    const loc = [c.city, c.region].filter(Boolean).join(", ");
    return {
      label: (c.name || c.city).slice(0, 100),
      value: String(c.id),
      description: loc ? `${loc}, ${c.country}`.slice(0, 100) : c.country.slice(0, 100),
    };
  });

  // Fallback if no chapters exist in DB
  if (chapterOptions.length === 0) {
    chapterOptions.push({
      label: "General / Remote",
      value: "1",
      description: "Default chapter",
    });
  }

  // Build Modal with Label (type 18) wrappers
  return {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: "spark_register_modal",
      title: "Spark Member Registration",
      components: [
        // 1. Name input
        {
          type: ComponentType.Label,
          label: "Your Name (First & Last Initial)",
          description: "Format: First Name Last Initial (e.g., Alex K.)",
          component: {
            type: ComponentType.TextInput,
            custom_id: "name_input",
            style: TextInputStyle.Short,
            placeholder: "Alex K.",
            min_length: 2,
            max_length: 32,
            required: true,
          },
        } as any,
        // 2. Chapter Select
        {
          type: ComponentType.Label,
          label: "Your Chapter",
          description: "Select your active local Spark chapter",
          component: {
            type: ComponentType.StringSelect,
            custom_id: "chapter_select",
            placeholder: "Select your chapter...",
            min_values: 1,
            max_values: 1,
            options: chapterOptions.slice(0, 25), // Discord max 25 options
          },
        } as any,
        // 3. Country Select (hardcoded)
        {
          type: ComponentType.Label,
          label: "Country",
          description: "Country of residence",
          component: {
            type: ComponentType.StringSelect,
            custom_id: "country_select",
            placeholder: "Select your country...",
            min_values: 1,
            max_values: 1,
            options: [
              {
                label: "United States",
                value: "United States",
                description: "United States",
                default: true,
              },
              {
                label: "Canada",
                value: "Canada",
                description: "Canada",
              },
              {
                label: "United Kingdom",
                value: "United Kingdom",
                description: "United Kingdom",
              },
              {
                label: "International / Other",
                value: "International",
                description: "Other country",
              },
            ],
          },
        } as any,
      ],
    },
  };
}

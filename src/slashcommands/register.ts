import { ApplicationCommandType } from "discord-api-types/v10";
import {
    createPersistentCustomId,
    persistBuilder,
    registerPersistentHandler,
    registerPersistentMetadata,
    registerPersistentModalHandler,
    updatePersistentParams,
} from "../discordBS/builders/callbacks.ts";
import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    StringSelectMenuBuilder,
    TextDisplayBuilder,
    TextInputBuilder,
    TextInputStyle,
} from "../discordBS/builders/index.ts";
import { DiscordClient } from "../discordBS/index.ts";
import type { ComponentInteraction } from "../discordBS/interactions/component.ts";
import type { ModalInteraction } from "../discordBS/interactions/modal.ts";
import type { InteractionReply } from "../discordBS/interactions/reply.ts";
import { createTicket } from "../services/tickets.ts";
import type { SlashCommand } from "./types.ts";

/** Updates the server nickname without undoing a successful registration on failure. */
async function updateRegistrationNickname(wizard: RegistrationWizard): Promise<string> {
    const parts = wizard.name.trim().split(/\s+/u).filter(Boolean);
    const firstName = parts[0] ?? "";
    const lastInitial = parts.length > 1 ? Array.from(parts[parts.length - 1]!)[0]!.toLocaleUpperCase() : "";
    const nickname = lastInitial
        ? `${Array.from(firstName).slice(0, 29).join("")} ${lastInitial}.`
        : Array.from(firstName).slice(0, 32).join("");
    try {
        await wizard.client.getGuild(wizard.guildId).getMember(wizard.userId)
            .setNickname(nickname, "Spark membership registration");
        return "";
    } catch (error) {
        console.error("Registration nickname update failed", error);
        return "\nYour registration was saved, but I couldn't update your server nickname. An administrator may need to check my nickname permissions and role position.";
    }
}

type DatabaseRow = Record<string, unknown>;
type LocationLevel = "country" | "state" | "chapter";

type Chapter = {
    id: number;
    country: string;
    region_id: number | null;
    region: string | null;
    city: string;
    name: string | null;
    discord_role_id: string | null;
};

type Role = {
    id: number;
    name: string;
    description: string | null;
    discord_role_id: string | null;
};

type RegistrationWizard = {
    client: DiscordClient;
    reply: InteractionReply;
    guildId: string;
    userId: string;
    name: string;
    chapters: Chapter[];
    roles: Role[];
    countries: string[];
    regions: { country: string; name: string; code: string }[];
    email: string | null;
    country: string | null;
    state: string | null;
    stateCode: string | null;
    chapterId: number | null;
    volunteerSelected: boolean;
    specialRoleIds: number[];
    customLocation: {
        country: string;
        state: string;
        stateCode: string;
        city: string;
        chapter: string;
    } | null;
    locationLevel: LocationLevel;
    editingLocation: boolean;
    expiresAt: number;
    expired: boolean;
};

const registrationTimeout = 5 * 60 * 1000;
const executiveRoleId = "1334030809577029713";

registerPersistentHandler("register.volunteer-confirm", async (interaction, rawParams) => {
    const params = rawParams as {
        guildId: string;
        userId: string;
        name: string;
        chapterReviewerIds: string[];
        chapterApprovalRoleIds: string[];
        approved: boolean;
    };
    const authorized = isExecutive(interaction) ||
        params.chapterReviewerIds.includes(interaction.user?.userId ?? "");
    if (!authorized) {
        await interaction.reply({
            content: "Only an executive, chapter lead, or chapter vice lead can approve this registration.",
            ephemeral: true,
        });
        return;
    }
    const member = interaction.guild?.getMember(params.userId);
    if (!member) throw new Error(`Member ${params.userId} is unavailable.`);
    if (params.approved) {
        await Promise.all(params.chapterApprovalRoleIds.map((roleId) => member.addRole(roleId)));
    } else {
        await Promise.all(params.chapterApprovalRoleIds.map((roleId) => member.removeRole(roleId)));
    }
    await interaction.update({
        embeds: [new EmbedBuilder()
            .setTitle("Is this person from your chapter?")
            .setDescription(params.approved
                ? "Confirmed. The volunteer, country, state, and chapter roles have been assigned."
                : "Denied. No registration roles were assigned.")
            .setColor(params.approved ? 0x57f287 : 0xed4245)],
        components: [],
    });
});

function isExpired(wizard: RegistrationWizard): boolean {
    return wizard.expired || Date.now() >= wizard.expiresAt;
}

function locationStates(wizard: RegistrationWizard): string[] {
    return wizard.regions
        .filter((region) => region.country === wizard.country)
        .map((region) => region.name)
        .sort();
}

async function showLocationModal(wizard: RegistrationWizard, interaction: InteractionReply): Promise<void> {
    const location = wizard.customLocation;
    const modal = new ModalBuilder()
        .setTitle("Register Location")
        .setCustomId("registerLocationModal")
        .addComponents(
            new TextInputBuilder()
                .setCustomId("country")
                .setStyle(TextInputStyle.Short)
                .setLabel("Country")
                .setDescription("Please Use Title Case")
                .setValue(location?.country ?? wizard.country ?? "")
                .setMaxLength(100)
                .setRequired(true),
            new TextInputBuilder()
                .setCustomId("state")
                .setStyle(TextInputStyle.Short)
                .setLabel("State/Region")
                .setDescription("Leave empty if none")
                .setValue(location?.state ?? wizard.state ?? "")
                .setMaxLength(100)
                .setRequired(false),
            new TextInputBuilder()
                .setCustomId("stateCode")
                .setStyle(TextInputStyle.Short)
                .setLabel("State/Region Code")
                .setDescription("Leave empty if none")
                .setValue(location?.stateCode ?? wizard.stateCode ?? "")
                .setMaxLength(20)
                .setRequired(false),
            new TextInputBuilder()
                .setCustomId("city")
                .setStyle(TextInputStyle.Short)
                .setLabel("City")
                .setValue(location?.city ?? "")
                .setMaxLength(100)
                .setRequired(true),
            new TextInputBuilder()
                .setCustomId("chapter")
                .setStyle(TextInputStyle.Short)
                .setLabel("Chapter")
                .setValue(location?.chapter ?? "")
                .setMaxLength(100)
                .setRequired(true),
        );
    modal.onSubmit(async (modalInteraction: ModalInteraction) => {
        if (await respondToExpiredWizard(wizard, modalInteraction)) return;

        const country = modalInteraction.fields.getTextInputValue("country")!.trim();
        const state = modalInteraction.fields.getTextInputValue("state")?.trim() ?? "";
        const stateCode = modalInteraction.fields.getTextInputValue("stateCode")?.trim() ?? "";
        const chapter = modalInteraction.fields.getTextInputValue("chapter")!.trim();
        const city = modalInteraction.fields.getTextInputValue("city")!.trim();

        wizard.customLocation = { country, state, stateCode, city, chapter };
        wizard.country = country;
        wizard.state = state || null;
        wizard.stateCode = stateCode || null;
        wizard.chapterId = null;
        wizard.reply = modalInteraction;
        await modalInteraction.update(wizard.editingLocation
            ? await confirmationView(wizard)
            : rolesView(wizard));
    });
    await interaction.showModal(modal);
}

async function showChapterLeadEmailModal(
    wizard: RegistrationWizard,
    interaction: InteractionReply,
): Promise<void> {
    const emailInput = new TextInputBuilder()
        .setCustomId("email")
        .setStyle(TextInputStyle.Short)
        .setLabel("Email")
        .setMaxLength(320)
        .setRequired(true);
    if (wizard.email) emailInput.setValue(wizard.email);
    const emailModal = new ModalBuilder()
        .setTitle("Please enter your contact email")
        .setCustomId("chapterLeadEmailModal")
        .addComponents(
            new TextDisplayBuilder().setContent(
                "Chapter Leads must provide a contact email that will be publicly visible on our website.",
            ),
            emailInput,
        );
    emailModal.onSubmit(async (modalInteraction: ModalInteraction) => {
        const email = modalInteraction.fields.getTextInputValue("email")?.trim() ?? "";
        if (!email) {
            await modalInteraction.reply({ content: "Email is required for Chapter Lead.", ephemeral: true });
            return;
        }
        wizard.email = email;
        wizard.reply = modalInteraction;
        await modalInteraction.update(await confirmationView(wizard));
    });
    await interaction.showModal(emailModal);
}

function timeoutPayload() {

    return {
        embeds: [new EmbedBuilder()
            .setTitle("Registration timed out")
            .setDescription("This registration expired. Run `/register` to start again.")
            .setColor(0xed4245)],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("registration-timeout")
                    .setLabel("Timed out")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            )
        ],
        ephemeral: true,
    };
}

async function respondToExpiredWizard(
    wizard: RegistrationWizard,
    interaction: InteractionReply,
): Promise<boolean> {
    if (!isExpired(wizard)) return false;
    wizard.expired = true;
    await interaction.update(timeoutPayload());
    return true;
}

function locationView(wizard: RegistrationWizard) {
    const locationMenu = new StringSelectMenuBuilder()
        .setPlaceholder("Select an option")
        .setDisabled(false)
        .setMinValues(1)
        .setMaxValues(1);

    if (wizard.locationLevel === "country") {
        locationMenu.addOptions(...wizard.countries
            .sort()
            .map((country) => ({
                label: country.slice(0, 100),
                value: `country:${country}`.slice(0, 100),
            })));
    } else if (wizard.locationLevel === "state") {
        locationMenu.addOptions(...wizard.regions
            .filter((region) => region.country === wizard.country)
            .map((region) => ({
                label: region.name.slice(0, 100),
                value: `state:${region.name}`.slice(0, 100),
                ...(region.code ? { description: region.code.slice(0, 100) } : {}),
            })));
        locationMenu.addOptions({
            label: "Not working in person",
            value: "state:none",
            description: "No state or region",
        });
    } else {
        locationMenu.addOptions(...wizard.chapters
            .filter((chapter) =>
                chapter.country === wizard.country &&
                (!locationStates(wizard).length || chapter.region === wizard.state))
            .map((chapter) => ({
                label: (chapter.name || chapter.city).slice(0, 100),
                value: `chapter:${chapter.id}`.slice(0, 100),
                description: [chapter.city, chapter.region, chapter.country]
                    .filter(Boolean)
                    .join(", ")
                    .slice(0, 100),
            })));
    }

    locationMenu.addOptions({
        label: "Not Listed",
        value: "not-listed",
        description: "Enter this location for admin review",
    });
    locationMenu.onSelect(async (interaction) => {
        if (await respondToExpiredWizard(wizard, interaction)) return;

        const value = interaction.values.first()?.value;
        if (!value) return;
        if (value === "not-listed") {
            wizard.editingLocation = false;
            await showLocationModal(wizard, interaction);
            return;
        }

        const [kind, selected] = value.split(":");
        if (kind === "country") {
            wizard.country = selected ?? null;
            wizard.state = null;
            wizard.stateCode = null;
            wizard.chapterId = null;
            if (!locationStates(wizard).length) wizard.locationLevel = "chapter";
        }
        if (kind === "state") {
            wizard.state = selected === "none" ? null : selected ?? null;
            wizard.stateCode = wizard.regions.find((region) =>
                region.country === wizard.country && region.name === wizard.state)?.code ?? null;
            wizard.chapterId = null;
        }
        if (kind === "chapter") {
            wizard.chapterId = Number(selected);
            const returningToConfirmation = wizard.editingLocation;
            wizard.editingLocation = false;
            await interaction.update(returningToConfirmation
                ? await confirmationView(wizard)
                : rolesView(wizard));
            return;
        }

        if (wizard.locationLevel === "country") {
            wizard.locationLevel = locationStates(wizard).length ? "state" : "chapter";
        } else if (wizard.locationLevel === "state") {
            wizard.locationLevel = "chapter";
        }
        await interaction.update(locationView(wizard));
    });

    const backButton = new ButtonBuilder()
        .setLabel("Back")
        .setStyle(ButtonStyle.Secondary);
    backButton.onClick(async (interaction) => {
        if (await respondToExpiredWizard(wizard, interaction)) return;
        if (wizard.locationLevel === "chapter") {
            wizard.locationLevel = locationStates(wizard).length ? "state" : "country";
            wizard.chapterId = null;
        } else {
            wizard.locationLevel = "country";
            wizard.country = null;
            wizard.state = null;
            wizard.stateCode = null;
            wizard.chapterId = null;
        }
        await interaction.update(locationView(wizard));
    });

    const navigation = wizard.locationLevel === "country"
        ? []
        : [backButton];
    return {
        embeds: [new EmbedBuilder()
            .setTitle("Spark registration")
            .setDescription(`${wizard.locationLevel === "country"
                ? "Choose your country"
                : wizard.locationLevel === "state"
                    ? "Choose your state"
                    : "Choose your chapter"}. Use Back to revisit a choice.`)
            .setColor(0x5865f2)],
        components: [
            new ActionRowBuilder().addComponents(locationMenu),
            ...(navigation.length ? [new ActionRowBuilder().addComponents(...navigation)] : []),
        ],
        ephemeral: true,
    };
}

function rolesView(wizard: RegistrationWizard) {
    const selectableRoles = wizard.roles
        .filter((role) => !["volunteer", "admin team", "executive board"].includes(role.name.trim().toLowerCase()))
        .slice(0, 24);
    const roleMenu = new StringSelectMenuBuilder()
        .setPlaceholder("Volunteer")
        .setMinValues(1)
        .setMaxValues(Math.max(1, Math.min(25, selectableRoles.length + 1)))
        .addOptions(
            {
                label: "Volunteer",
                value: "none",
                description: "Volunteer for a specific chapter",
            },
            ...selectableRoles.map((role) => ({
                label: role.name.slice(0, 100),
                value: `role:${role.id}`.slice(0, 100),
                ...(role.description
                    ? { description: role.description.slice(0, 100) }
                    : {}),
            })),
        );
    roleMenu.onSelect(async (interaction) => {
        if (await respondToExpiredWizard(wizard, interaction)) return;
        wizard.specialRoleIds = interaction.values
            .map((item) => Number(item.value.split(":")[1]))
            .filter(Number.isInteger);
        wizard.volunteerSelected = interaction.values.some((item) => item.value === "none");
        const selectedRoles = wizard.roles.filter((role) => wizard.specialRoleIds.includes(role.id));
        const hasChapterLead = selectedRoles.some((role) => role.name.trim().toLowerCase() === "chapter lead");
        if (hasChapterLead) {
            await showChapterLeadEmailModal(wizard, interaction);
            return;
        }
        wizard.email = null;
        await interaction.update(await confirmationView(wizard));
    });

    const backButton = new ButtonBuilder()
        .setLabel("Back")
        .setStyle(ButtonStyle.Secondary);
    backButton.onClick(async (interaction) => {
        if (await respondToExpiredWizard(wizard, interaction)) return;
        wizard.locationLevel = wizard.chapterId ? "chapter" : wizard.state ? "state" : "country";
        await interaction.update(locationView(wizard));
    });

    return {
        embeds: [new EmbedBuilder()
            .setTitle("Choose special roles")
            .setDescription([
                "Select any special roles that apply to you.",
                "",
                "Special roles will be granted once an administrator has confirmed them.",
                "The default is Volunteer.",
            ].join("\n"))
            .setColor(0x5865f2)],
        components: [
            new ActionRowBuilder().addComponents(roleMenu),
            new ActionRowBuilder().addComponents(backButton),
        ],
        ephemeral: true,
    };
}

function locationText(wizard: RegistrationWizard): string {
    if (wizard.customLocation) {
        return [
            wizard.customLocation.chapter,
            wizard.customLocation.city,
            wizard.customLocation.state,
            wizard.customLocation.country,
        ].filter(Boolean).join(", ");
    }

    const chapter = wizard.chapters.find((item) => item.id === wizard.chapterId);
    return chapter
        ? [chapter.name || chapter.city, chapter.region, chapter.country].filter(Boolean).join(", ")
        : "Not selected";
}

function memberNameQuery(): string {
    return "lower(trim(name)) = lower(trim(?))";
}

function isLinkedDiscordId(value: unknown): value is string {
    return typeof value === "string" &&
        value.trim().length > 0 &&
        value.trim().toLowerCase() !== "null";
}

function isDiscordId(value: unknown): value is string {
    return typeof value === "string" && /^\d+$/.test(value.trim()) && value.trim() !== "0";
}

async function ensureLocation(
    client: DiscordClient,
    guildId: string,
    location: { country: string; state: string; stateCode?: string; city: string; chapter: string },
): Promise<{
    countryRoleId: string | null;
    chapterRoleId: string | null;
    chapterId: number;
}> {
    let country = await client.env.database.query<DatabaseRow>(
        "SELECT id, name, discord_role_id, region_ids FROM countries WHERE lower(trim(name)) = lower(trim(?)) LIMIT 1",
        location.country,
    ).first();
    if (!country) {
        await client.env.database.insert("countries", {
            name: location.country,
            discord_role_id: null,
            region_ids: "[]",
        }).run();
        country = await client.env.database.query<DatabaseRow>(
            "SELECT id, name, discord_role_id, region_ids FROM countries WHERE lower(trim(name)) = lower(trim(?)) LIMIT 1",
            location.country,
        ).first();
    }
    if (!country) throw new Error("Unable to create the requested country.");

    let countryRoleId = isDiscordId(country.discord_role_id) ? country.discord_role_id : null;
    if (!countryRoleId) {
        countryRoleId = (await client.getGuild(guildId).createRole({ name: location.country })).id;
        await client.env.database.update(
            "countries",
            { discord_role_id: countryRoleId },
            { id: Number(country.id) },
        ).run();
    }

    let chapter = await client.env.database.query<DatabaseRow>(
        `SELECT chapters.id, chapters.name, chapters.region_id, regions.name AS region, chapters.discord_role_id
         FROM chapters
         LEFT JOIN regions ON regions.id = chapters.region_id
         WHERE lower(trim(chapters.country)) = lower(trim(?))
           AND (
             lower(trim(COALESCE(regions.name, ''))) = lower(trim(?))
             OR chapters.region_id IS NULL
           )
           AND lower(trim(COALESCE(chapters.name, ''))) = lower(trim(?))
           AND lower(trim(chapters.city)) = lower(trim(?))
         LIMIT 1`,
        location.country,
        location.state,
        location.chapter,
        location.city,
    ).first();
    if (!chapter) {
        let region = location.state
            ? await client.env.database.query<{ id: number }>(
                `SELECT regions.id
                 FROM regions
                 JOIN countries ON countries.id = regions.country_id
                 WHERE lower(trim(countries.name)) = lower(trim(?))
                   AND lower(trim(regions.name)) = lower(trim(?))
                 LIMIT 1`,
                location.country,
                location.state,
            ).first()
            : null;
        if (location.state && !region) {
            await client.env.database.insert("regions", {
                country_id: Number(country.id),
                name: location.state,
                code: location.state,
            }).run();
            region = await client.env.database.query<{ id: number }>(
                `SELECT id FROM regions
                 WHERE country_id = ? AND lower(trim(name)) = lower(trim(?))
                 LIMIT 1`,
                Number(country.id),
                location.state,
            ).first();
            if (!region) throw new Error("Unable to create the requested region.");

            let regionIds: number[] = [];
            const parsedRegionIds = JSON.parse(String(country.region_ids ?? "[]"));
            if (Array.isArray(parsedRegionIds)) {
                regionIds = parsedRegionIds.filter((id): id is number =>
                    Number.isInteger(id) && id > 0);
            }
            if (!regionIds.includes(region.id)) {
                await client.env.database.update(
                    "countries",
                    { region_ids: JSON.stringify([...regionIds, region.id]) },
                    { id: Number(country.id) },
                ).run();
            }
        }
        await client.env.database.insert("chapters", {
            country: location.country,
            country_id: Number(country.id),
            region_id: region?.id ?? null,
            city: location.city,
            name: location.chapter,
            discord_role_id: null,
        }).run();
        chapter = await client.env.database.query<DatabaseRow>(
            `SELECT chapters.id, chapters.name, chapters.region_id, regions.name AS region, chapters.discord_role_id
             FROM chapters
             LEFT JOIN regions ON regions.id = chapters.region_id
             WHERE lower(trim(chapters.country)) = lower(trim(?))
               AND (
                 lower(trim(COALESCE(regions.name, ''))) = lower(trim(?))
                 OR chapters.region_id IS NULL
               )
               AND lower(trim(COALESCE(chapters.name, ''))) = lower(trim(?))
               AND lower(trim(chapters.city)) = lower(trim(?))
             LIMIT 1`,
            location.country,
            location.state,
            location.chapter,
            location.city,
        ).first();
    }
    if (!chapter) throw new Error("Unable to create the requested chapter.");

    let chapterRoleId = isDiscordId(chapter.discord_role_id) ? chapter.discord_role_id : null;
    if (!chapterRoleId) {
        const roleName = `${location.chapter}${location.stateCode ? ` - ${location.stateCode}` : ""}`;
        chapterRoleId = (await client.getGuild(guildId).createRole({ name: roleName })).id;
        await client.env.database.update(
            "chapters",
            { discord_role_id: chapterRoleId },
            { id: Number(chapter.id) },
        ).run();
    }
    return { countryRoleId, chapterRoleId, chapterId: Number(chapter.id) };
}

type RegistrationSpecialRequest = {
    label: string;
    value: string;
    roleId?: string;
    roleIds?: string[];
    location?: {
        country: string;
        state: string;
        stateCode?: string;
        city: string;
        chapter: string;
    };
    email?: string;
    databaseRoleId?: number;
    chapterId?: number;
};

function isExecutive(interaction: ComponentInteraction): boolean {
    return Boolean(interaction.user?.roles.includes(executiveRoleId));
}

function specialRequestEmbed(
    requests: RegistrationSpecialRequest[],
    statuses: Map<number, "pending" | "confirmed" | "denied">,
    index: number,
): EmbedBuilder {
    const request = requests[index];
    if (!request) throw new Error(`Special request index ${index} is out of range.`);
    const status = statuses.get(index) ?? "pending";
    return new EmbedBuilder()
        .setTitle("Special request review")
        .setDescription([
            `Request ${index + 1} of ${requests.length}`,
            "",
            `**${request.label}**`,
            request.value,
            "",
            status === "confirmed" ? "Confirmed" : status === "denied" ? "Denied" : "Pending",
        ].join("\n"))
        .setColor(status === "confirmed" ? 0x57f287 : status === "denied" ? 0xed4245 : 0xfee75c);
}

type PersistentSpecialRequestParams = {
    guildId: string;
    userId: string;
    ticketId: string;
    specialRequests: RegistrationSpecialRequest[];
    index: number;
    confirmed: number[];
    denied: number[];
};

type PersistentSpecialRequestModalParams = PersistentSpecialRequestParams & {
    requestIndex: number;
};

function specialRequestEditModal(params: PersistentSpecialRequestModalParams) {
    const request = params.specialRequests[params.requestIndex];
    if (!request) throw new Error(`Special request index ${params.requestIndex} is out of range.`);
    const inputs = request.location
        ? [
            new TextInputBuilder().setCustomId("country").setStyle(TextInputStyle.Short)
                .setLabel("Country").setValue(request.location.country).setMaxLength(100).setRequired(true),
            new TextInputBuilder().setCustomId("state").setStyle(TextInputStyle.Short)
                .setLabel("State or region (leave empty if none)").setValue(request.location.state)
                .setMaxLength(100).setRequired(false),
            new TextInputBuilder().setCustomId("stateCode").setStyle(TextInputStyle.Short)
                .setLabel("State code (optional)").setValue(request.location.stateCode ?? "")
                .setMaxLength(10).setRequired(false),
            new TextInputBuilder().setCustomId("chapter").setStyle(TextInputStyle.Short)
                .setLabel("Chapter").setValue(request.location.chapter).setMaxLength(100).setRequired(true),
            new TextInputBuilder().setCustomId("city").setStyle(TextInputStyle.Short)
                .setLabel("City").setValue(request.location.city).setMaxLength(100).setRequired(true),
        ]
        : [new TextInputBuilder().setCustomId("value").setStyle(TextInputStyle.Paragraph)
            .setLabel(request.label).setValue(request.value).setMaxLength(1000).setRequired(true)];
    const customId = createPersistentCustomId(
        "register.special-request-edit",
        params.ticketId,
        String(params.requestIndex),
    );
    const metadata = {
        customId,
        handlerKey: "register.special-request-edit",
        ownerKey: params.ticketId,
        params,
    };
    registerPersistentMetadata(metadata);
    return {
        modal: new ModalBuilder()
            .setTitle("Edit special request")
            .setCustomId(customId)
            .addComponents(...inputs.map((input) => new ActionRowBuilder().addComponents(input))),
        metadata,
    };
}

function specialRequestView(params: PersistentSpecialRequestParams) {
    const back = new ButtonBuilder().setLabel("Back").setStyle(ButtonStyle.Secondary);
    const edit = new ButtonBuilder().setLabel("Edit").setStyle(ButtonStyle.Secondary);
    const next = new ButtonBuilder().setLabel("Next").setStyle(ButtonStyle.Primary);
    const confirm = new ButtonBuilder().setLabel("Confirm").setStyle(ButtonStyle.Success);
    const deny = new ButtonBuilder().setLabel("Deny").setStyle(ButtonStyle.Danger);
    const persistent = (action: string) => ({
        persistent: true as const,
        ownerKey: params.ticketId,
        persistentKey: action,
        params: { ...params, action },
    });
    back.onClick("register.special-request", persistent("back"));
    edit.onClick("register.special-request", persistent("edit"));
    next.onClick("register.special-request", persistent("next"));
    confirm.onClick("register.special-request", persistent("confirm"));
    deny.onClick("register.special-request", persistent("deny"));
    back.setDisabled(params.index === 0);
    edit.setDisabled(Boolean(params.specialRequests[params.index]?.roleId));
    next.setDisabled(params.index === params.specialRequests.length - 1);
    return {
        embeds: [specialRequestEmbed(
            params.specialRequests,
            new Map<number, "confirmed" | "denied">([
                ...params.confirmed.map((item): [number, "confirmed"] => [item, "confirmed"]),
                ...params.denied.map((item): [number, "denied"] => [item, "denied"]),
            ]),
            params.index,
        )],
        components: [new ActionRowBuilder().addComponents(back, edit, next, confirm, deny)],
    };
}

registerPersistentHandler("register.special-request", async (interaction, rawParams) => {
    const params = rawParams as PersistentSpecialRequestParams & { action: string };
    if (!isExecutive(interaction)) {
        await interaction.reply({
            content: "Only an executive can manage special requests.",
            ephemeral: true,
        });
        return;
    }
    const nextParams: PersistentSpecialRequestParams = {
        guildId: params.guildId,
        userId: params.userId,
        ticketId: params.ticketId,
        specialRequests: params.specialRequests,
        index: params.index,
        confirmed: params.confirmed,
        denied: params.denied,
    };
    const request = nextParams.specialRequests[nextParams.index];
    if (!request) throw new Error(`Special request index ${nextParams.index} is out of range.`);
    if (params.action === "back") {
        nextParams.index = Math.max(0, nextParams.index - 1);
    } else if (params.action === "next") {
        nextParams.index = Math.min(nextParams.specialRequests.length - 1, nextParams.index + 1);
    } else if (params.action === "confirm" || params.action === "deny") {
        const member = interaction.guild?.getMember(nextParams.userId);
        if (!member) throw new Error(`Member ${nextParams.userId} is unavailable.`);
        const roleIds = request.roleIds ?? (request.roleId ? [request.roleId] : []);
        await Promise.all(roleIds.map((roleId) =>
            params.action === "confirm" ? member.addRole(roleId) : member.removeRole(roleId)));
        const confirmed = new Set(nextParams.confirmed);
        const denied = new Set(nextParams.denied);
        if (params.action === "confirm") {
            confirmed.add(nextParams.index);
            denied.delete(nextParams.index);
        } else {
            confirmed.delete(nextParams.index);
            denied.add(nextParams.index);
        }
        nextParams.confirmed = [...confirmed];
        nextParams.denied = [...denied];
    } else if (params.action === "edit") {
        const requestIndex = nextParams.index;
        const { modal, metadata } = specialRequestEditModal({ ...nextParams, requestIndex });
        await persistBuilder(interaction.env, metadata);
        await interaction.showModal(modal);
        return;
    }
    await updatePersistentParams(interaction.env, interaction.customId, nextParams);
    await interaction.update(specialRequestView(nextParams));
});

registerPersistentModalHandler("register.special-request-edit", async (interaction: ModalInteraction, rawParams: Record<string, unknown>) => {
    const params = rawParams as PersistentSpecialRequestModalParams;
    const request = params.specialRequests[params.requestIndex];
    if (!request) throw new Error(`Special request index ${params.requestIndex} is out of range.`);
    const nextParams: PersistentSpecialRequestParams = {
        guildId: params.guildId,
        userId: params.userId,
        ticketId: params.ticketId,
        specialRequests: params.specialRequests,
        index: params.requestIndex,
        confirmed: params.confirmed,
        denied: params.denied,
    };
    if (request.location) {
        const country = interaction.fields.getTextInputValue("country")!.trim();
        const state = interaction.fields.getTextInputValue("state")?.trim() ?? "";
        const stateCode = interaction.fields.getTextInputValue("stateCode")?.trim() ?? "";
        const city = interaction.fields.getTextInputValue("city")!.trim();
        const chapter = interaction.fields.getTextInputValue("chapter")!.trim();
        request.location = { country, state, stateCode, city, chapter };
        request.value = [chapter, city, state, country].filter(Boolean).join(", ");
        const locationRoles = await ensureLocation(new DiscordClient(interaction.env, []), params.guildId, request.location);
        request.roleIds = [locationRoles.countryRoleId, locationRoles.chapterRoleId]
            .filter((roleId): roleId is string => Boolean(roleId));
    } else {
        request.value = interaction.fields.getTextInputValue("value")!.trim();
    }
    await updatePersistentParams(interaction.env, interaction.customId, nextParams);
    await interaction.update(specialRequestView(nextParams));
});

async function sendRegistrationReviewMessages(options: {
    client: DiscordClient;
    guildId: string;
    userId: string;
    ticketId: string;
    name: string;
    chapterReviewerIds: string[];
    roleIds: string[];
    specialRequests: RegistrationSpecialRequest[];
    chapterApprovalRoleIds: string[];
    volunteerSelected: boolean;
} ): Promise<void> {
    const channel = options.client.getGuild(options.guildId).getChannel(options.ticketId);
    if (options.chapterApprovalRoleIds.length && options.volunteerSelected) {
        const approve = new ButtonBuilder().setLabel("Yes").setStyle(ButtonStyle.Success);
        const reject = new ButtonBuilder().setLabel("No").setStyle(ButtonStyle.Danger);
        const persistent = (approved: boolean) => ({
            persistent: true as const,
            ownerKey: options.ticketId,
            persistentKey: approved ? "approve" : "reject",
            params: {
                guildId: options.guildId,
                userId: options.userId,
                name: options.name,
                chapterReviewerIds: options.chapterReviewerIds,
                chapterApprovalRoleIds: options.chapterApprovalRoleIds,
                approved,
            },
        });
        approve.onClick("register.volunteer-confirm", persistent(true));
        reject.onClick("register.volunteer-confirm", persistent(false));
        await channel.sendMessage({
            embeds: [new EmbedBuilder()
                .setTitle("Is this person from your chapter?")
                .setDescription(`A chapter lead, vice lead, or executive board member must confirm ${options.name}.`)
                .setColor(0xfee75c)],
            components: [new ActionRowBuilder().addComponents(approve, reject)],
        });
    }
    if (!options.specialRequests.length) return;

    await channel.sendMessage(specialRequestView({
        guildId: options.guildId,
        userId: options.userId,
        ticketId: options.ticketId,
        specialRequests: options.specialRequests,
        index: 0,
        confirmed: [],
        denied: [],
    }));
}

async function confirmationView(wizard: RegistrationWizard) {
    const hasChapterLead = wizard.specialRoleIds.some((roleId) =>
        wizard.roles.find((role) => role.id === roleId)?.name.trim().toLowerCase() === "chapter lead",
    );
    const editMenu = new StringSelectMenuBuilder()
        .setPlaceholder("Choose a section to edit")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
            { label: "Name", value: "name" },
            ...(wizard.customLocation
                ? [{ label: "Location", value: "country" }]
                : [
                    { label: "Country", value: "country" },
                    { label: "State", value: "state" },
                    { label: "Chapter", value: "chapter" },
                ]),
            ...(hasChapterLead ? [{ label: "Email", value: "email" }] : []),
            { label: "Special roles", value: "roles" },
        );
    editMenu.onSelect(async (interaction) => {
        if (await respondToExpiredWizard(wizard, interaction)) return;
        const section = interaction.values.first()?.value;
        if (section === "name") {
            const nameInput = new TextInputBuilder()
                .setCustomId("name")
                .setStyle(TextInputStyle.Short)
                .setLabel("Full name")
                .setValue(wizard.name)
                .setMaxLength(200)
                .setRequired(true);
            const modal = new ModalBuilder()
                .setTitle("Edit your name")
                .setCustomId("editRegistrationName")
                .addComponents(nameInput);
            modal.onSubmit(async (modalInteraction) => {
                const name = modalInteraction.fields.getTextInputValue("name")!.trim();
                if (!name) {
                    await modalInteraction.reply({ content: "Name is required.", ephemeral: true });
                    return;
                }
                wizard.name = name;
                wizard.reply = modalInteraction;
                await modalInteraction.update(await confirmationView(wizard));
            });
            await interaction.showModal(modal);
            return;
        }
        if (section === "roles") {
            await interaction.update(rolesView(wizard));
            return;
        }
        if (section === "email") {
            await showChapterLeadEmailModal(wizard, interaction);
            return;
        }
        if (section === "country" || section === "state" || section === "chapter") {
            if (wizard.customLocation) {
                wizard.editingLocation = true;
                await showLocationModal(wizard, interaction);
                return;
            }
            wizard.customLocation = null;
            wizard.locationLevel = section;
            wizard.editingLocation = true;
            await interaction.update(locationView(wizard));
        }
    });

    const submitButton = new ButtonBuilder()
        .setLabel("Submit")
        .setStyle(ButtonStyle.Success);
    submitButton.onClick(async (interaction) => {
        if (await respondToExpiredWizard(wizard, interaction)) return;

        let member = await wizard.client.env.database.query<DatabaseRow>(
            "SELECT id, chapter_id FROM members WHERE discord_id = ? LIMIT 1",
            wizard.userId,
        ).first();
        if (!member) {
            const existing = await wizard.client.env.database.query<DatabaseRow>(
                `SELECT id, discord_id FROM members WHERE ${memberNameQuery()}
                 ORDER BY CASE
                     WHEN discord_id IS NULL OR trim(discord_id) = '' OR lower(trim(discord_id)) = 'null' THEN 1
                     ELSE 0
                 END, id
                 LIMIT 1`,
                wizard.name,
            ).first();
            if (existing) {
                if (isLinkedDiscordId(existing.discord_id)) {
                    await interaction.update({
                        embeds: [new EmbedBuilder()
                            .setDescription(`You are already registered with the discord account <@${existing.discord_id}> linked`)
                            .setColor(0xfee75c)],
                        content: undefined,
                        components: [],
                        ephemeral: true,
                    });
                    return;
                }
                await wizard.client.env.database.update(
                    "members",
                    { discord_id: wizard.userId, ...(wizard.email ? { email: wizard.email } : {}) },
                    { id: Number(existing.id) },
                ).run();
                const nicknameNotice = await updateRegistrationNickname(wizard);
                await interaction.update({
                    embeds: [new EmbedBuilder()
                        .setDescription("Linked your existing user to your current discord account" + nicknameNotice)
                        .setColor(0x57f287)],
                    content: undefined,
                    components: [],
                    ephemeral: true,
                });
                return;
            }

            await wizard.client.env.database.insert("members", {
                name: wizard.name,
                chapter_id: wizard.chapterId,
                email: wizard.email,
                discord_id: wizard.userId,
            }).run();
            member = await wizard.client.env.database.query<DatabaseRow>(
                "SELECT id, chapter_id FROM members WHERE discord_id = ? LIMIT 1",
                wizard.userId,
            ).first();
        }

        if (!member) throw new Error("Unable to find the registered member.");
        const memberId = Number(member.id);
        const customLocationRoles = wizard.customLocation
            ? await ensureLocation(wizard.client, wizard.guildId, wizard.customLocation)
            : null;
        if (customLocationRoles) {
            wizard.chapterId = customLocationRoles.chapterId;
            await wizard.client.env.database.update(
                "members",
                { chapter_id: customLocationRoles.chapterId, ...(wizard.email ? { email: wizard.email } : {}) },
                { id: memberId },
            ).run();
        }
        const specialRoleRows = wizard.specialRoleIds.length
            ? await wizard.client.env.database.query<DatabaseRow>(
                `SELECT id, discord_role_id FROM roles WHERE id IN (${wizard.specialRoleIds.map(() => "?").join(",")})`,
                ...wizard.specialRoleIds,
            ).all()
            : [];
        const locationRoleRows = await wizard.client.env.database.query<DatabaseRow>(
            "SELECT id, discord_role_id FROM roles WHERE lower(trim(name)) = lower(trim(?))",
            wizard.state,
        ).all();
        const roleRows = [...locationRoleRows];
        const allRoleRows = [...specialRoleRows, ...roleRows];
        const volunteerRole = await wizard.client.env.database.query<DatabaseRow>(
            "SELECT id, discord_role_id FROM roles WHERE lower(trim(name)) = 'volunteer' LIMIT 1",
        ).first();
        if (!volunteerRole) throw new Error("The Volunteer role is missing from the roles table.");
        roleRows.push(volunteerRole);
        allRoleRows.push(volunteerRole);

        await wizard.client.env.database.delete("member_roles", { member_id: memberId }).run();
        await wizard.client.env.database.insertMany(
            "member_roles",
            roleRows.map((row) => ({ member_id: memberId, role_id: Number(row.id) })),
        );

        const chapter = wizard.chapters.find((item) => item.id === wizard.chapterId);
        const countryRow = wizard.customLocation
            ? null
            : await wizard.client.env.database.query<DatabaseRow>(
                "SELECT discord_role_id FROM countries WHERE lower(trim(name)) = lower(trim(?)) LIMIT 1",
                wizard.country,
            ).first();
        const configuredDiscordRoleIds = allRoleRows
            .map((row) => row.discord_role_id)
            .concat(chapter?.discord_role_id ?? null)
            .concat(customLocationRoles?.countryRoleId ?? null, customLocationRoles?.chapterRoleId ?? null)
            .filter((id): id is string => typeof id === "string" && Boolean(id));
        const chapterApprovalRoleIds = wizard.customLocation
            ? wizard.volunteerSelected && isDiscordId(volunteerRole.discord_role_id)
                ? [volunteerRole.discord_role_id]
                : []
            : [...new Set([
                ...roleRows
                    .filter((row) => !wizard.specialRoleIds.includes(Number(row.id)))
                    .map((row) => row.discord_role_id)
                    .filter((id): id is string => isDiscordId(id)),
                countryRow?.discord_role_id,
                chapter?.discord_role_id,
            ].filter((id): id is string => isDiscordId(id)))];
        const chapterReviewerRows = wizard.chapterId
            ? await wizard.client.env.database.query<DatabaseRow>(
                `SELECT DISTINCT members.discord_id
                 FROM members
                 JOIN member_roles ON member_roles.member_id = members.id
                 JOIN roles ON roles.id = member_roles.role_id
                 WHERE members.chapter_id = ?
                   AND members.discord_id IS NOT NULL
                   AND lower(trim(roles.name)) IN ('chapter lead', 'chapter vice lead', 'vice lead')`,
                wizard.chapterId,
            ).all()
            : [];
        const chapterReviewerIds = chapterReviewerRows
            .map((row) => row.discord_id)
            .filter(isDiscordId);
        const specialRequests = [
            ...(wizard.customLocation
                ? [{
                    label: "Custom location",
                    value: locationText(wizard),
                    location: wizard.customLocation,
                    chapterId: customLocationRoles?.chapterId,
                    roleIds: [
                        customLocationRoles?.countryRoleId,
                        customLocationRoles?.chapterRoleId,
                    ].filter((roleId): roleId is string => Boolean(roleId)),
                }]
                : []),
            ...wizard.specialRoleIds.map((roleId) => {
                const role = wizard.roles.find((item) => item.id === roleId);
                const configuredRoleId = allRoleRows.find((row) => Number(row.id) === roleId)?.discord_role_id;
                const discordRoleId = typeof configuredRoleId === "string" && isDiscordId(configuredRoleId)
                    ? configuredRoleId
                    : undefined;
                return {
                    label: role?.name ?? "Special role",
                    value: role?.description ?? "Special role requested.",
                    ...(role?.name.trim().toLowerCase() === "chapter lead" && wizard.email
                        ? { email: wizard.email, value: `${role?.description ?? "Chapter lead requested."}\nEmail: ${wizard.email}` }
                        : {}),
                    databaseRoleId: roleId,
                    roleIds: typeof discordRoleId === "string" && discordRoleId
                        ? [discordRoleId]
                        : [],
                    ...(typeof discordRoleId === "string" && discordRoleId
                        ? { roleId: discordRoleId }
                        : {}),
                };
            }),
        ];

        const ticketId = await createTicket({
            client: wizard.client,
            userId: wizard.userId,
            channelName: `registration-${wizard.userId}`,
            embedTitle: "Registration ticket",
            topic: wizard.customLocation
                ? `Location not listed: ${locationText(wizard)}`
                : wizard.specialRoleIds.length
                    ? `Please review special roles for ${wizard.name}.`
                    : `Please confirm that ${wizard.name} is from your chapter.`,
            whitelist: {
                userIds: chapterReviewerIds,
                roleIds: [executiveRoleId],
            },
        });
        await sendRegistrationReviewMessages({
            client: wizard.client,
            guildId: wizard.guildId,
            userId: wizard.userId,
            ticketId,
            name: wizard.name,
            chapterReviewerIds,
            roleIds: configuredDiscordRoleIds,
            specialRequests,
            chapterApprovalRoleIds,
            volunteerSelected: wizard.volunteerSelected,
        });
        const nicknameNotice = await updateRegistrationNickname(wizard);
        await interaction.update({
            embeds: [new EmbedBuilder()
                .setTitle("Registration complete")
                .setDescription((ticketId
                    ? `Your registration is saved. An administrator will review ticket <#${ticketId}>.`
                    : "Your registration is saved and your Discord roles have been assigned.") + nicknameNotice)
                .setColor(0x57f287)],
            components: [],
            ephemeral: true,
        });
    });

    return {
        embeds: [new EmbedBuilder()
            .setTitle("Confirm your registration")
            .setDescription("Review your information, then submit or edit a section.")
            .setColor(0x57f287)
            .setFields(
                { name: "Full name", value: wizard.name },
                { name: "Location", value: locationText(wizard) },
                {
                    name: "Special roles",
                    value: wizard.specialRoleIds.length
                        ? wizard.roles
                            .filter((role) => wizard.specialRoleIds.includes(role.id))
                            .map((role) => role.name)
                            .join(", ")
                        : "Volunteer",
                },
                ...(hasChapterLead && wizard.email
                    ? [{ name: "Chapter Lead email", value: wizard.email }]
                    : []),
            )],
        components: [
            new ActionRowBuilder().addComponents(editMenu),
            new ActionRowBuilder().addComponents(submitButton),
        ],
        ephemeral: true,
    };
}

const command: SlashCommand = {
    name: "register",
    description: "Register your Spark membership",
    type: ApplicationCommandType.ChatInput,
    async run(client, interaction) {
        try {
            const guildId = interaction.raw.guild_id;
            const userId = interaction.raw.member?.user?.id ?? interaction.raw.user?.id;
            if (!guildId || !userId) {
                await interaction.reply({
                    content: "Registration is only available in the server.",
                    ephemeral: true,
                });
                return;
            }

            const linkedMember = await client.env.database.query<DatabaseRow>(
                "SELECT name FROM members WHERE discord_id = ? LIMIT 1",
                userId,
            ).first();
            if (linkedMember) {
                await interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setDescription(`This discord account is already linked with \`${String(linkedMember.name)}\``)
                        .setColor(0xfee75c)],
                    content: undefined,
                    ephemeral: true,
                });
                return;
            }

            const modal = new ModalBuilder()
                .setTitle("Spark registration")
                .setCustomId("registerInitialModal")
                .addComponents(new TextInputBuilder()
                    .setCustomId("name")
                    .setStyle(TextInputStyle.Short)
                    .setLabel("Full name")
                    .setMaxLength(200)
                    .setRequired(true)
                );

            const wizard: RegistrationWizard = {
                client,
                reply: interaction,
                guildId,
                userId,
                name: "",
                chapters: [],
                roles: [],
                countries: [],
                regions: [],
                email: null,
                country: null,
                state: null,
                stateCode: null,
                chapterId: null,
                specialRoleIds: [],
                volunteerSelected: true,
                customLocation: null,
                locationLevel: "country",
                editingLocation: false,
                expiresAt: Date.now() + registrationTimeout,
                expired: false,
            };

            modal.onSubmit(async (modalInteraction) => {
                const modalUserId = modalInteraction.raw.member?.user?.id ?? modalInteraction.raw.user?.id;
                if (!modalUserId) throw new Error("Registration modal did not include a Discord user ID.");
                if (modalUserId !== userId) {
                    throw new Error("Registration modal user ID did not match the command user ID.");
                }

                wizard.name = modalInteraction.fields.getTextInputValue("name")!.trim();
                const existing = await client.env.database.query<DatabaseRow>(
                    `SELECT id, discord_id FROM members WHERE ${memberNameQuery()}
                     ORDER BY CASE
                         WHEN discord_id IS NULL OR trim(discord_id) = '' OR lower(trim(discord_id)) = 'null' THEN 1
                         ELSE 0
                     END, id
                     LIMIT 1`,
                    wizard.name,
                ).first();
                if (existing) {
                    if (isLinkedDiscordId(existing.discord_id)) {
                        await modalInteraction.reply({
                            embeds: [new EmbedBuilder()
                                .setDescription(`You are already registered with the discord account <@${existing.discord_id}> linked`)
                                .setColor(0xfee75c)],
                            content: undefined,
                            ephemeral: true,
                        });
                        return;
                    }
                    await client.env.database.update(
                        "members",
                        { discord_id: modalUserId },
                        { id: Number(existing.id) },
                    ).run();
                    const nicknameNotice = await updateRegistrationNickname(wizard);
                    await modalInteraction.reply({
                        embeds: [new EmbedBuilder()
                            .setDescription("Linked your existing user to your current discord account" + nicknameNotice)
                            .setColor(0x57f287)],
                        content: undefined,
                        ephemeral: true,
                    });
                    return;
                }

                wizard.chapters = await client.env.database.query<Chapter>(
                    `SELECT chapters.id, chapters.country, chapters.region_id, regions.name AS region,
                            chapters.city, chapters.name, chapters.discord_role_id
                     FROM chapters
                     LEFT JOIN regions ON regions.id = chapters.region_id`,
                ).all();
                const countryRows = await client.env.database.query<{ name: string }>(
                    "SELECT name FROM countries ORDER BY lower(name)",
                ).all();
                wizard.countries = countryRows.map((row) => row.name);
                wizard.regions = await client.env.database.query<{
                    country: string;
                    name: string;
                    code: string;
                }>(
                    `SELECT countries.name AS country, regions.name, regions.code
                     FROM regions
                     JOIN countries ON countries.id = regions.country_id
                     ORDER BY lower(countries.name), lower(regions.name)`,
                ).all();
                wizard.roles = await client.env.database.select("roles", {
                    columns: ["id", "name", "description", "discord_role_id"],
                    limit: 24,
                }).all() as Role[];
                wizard.reply = modalInteraction;
                await modalInteraction.reply(locationView(wizard));
                setTimeout(async () => {
                    if (!isExpired(wizard)) return;
                    wizard.expired = true;
                    try {
                        await wizard.reply.edit(timeoutPayload());
                    } catch (error) {
                        console.error("registration timeout update failed", error);
                    }
                }, registrationTimeout);
            });
            await interaction.showModal(modal);
        } catch (error) {
            console.error("register command failed", error);
            if (!interaction.isAcknowledged) {
                await interaction.reply({
                    content: "Unable to start registration.",
                    ephemeral: true,
                });
            }
        }
    },
};

export default command;

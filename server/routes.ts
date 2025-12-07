import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import Cerebras from "@cerebras/cerebras_cloud_sdk";
import { chatRequestSchema, scenarios, type ChatResponse, type Message, type Session } from "@shared/schema";
import { randomUUID } from "crypto";
import { selectBestScript, generateScriptGuidance, getScriptById, type MPTScript } from "./mpt-scripts";
import { 
  createInitialSessionState, 
  detectRequestType, 
  detectClientSaysIDontKnow, 
  getHelpingQuestion,
  extractClientName,
  extractImportanceRating,
  selectHomework,
  generateStagePrompt,
  shouldTransitionToNextStage,
  transitionToNextStage,
  transformToAuthorship,
  IMPLEMENTATION_PRACTICES,
  MPT_STAGE_CONFIG,
  REQUEST_TYPE_SCRIPTS,
  type SessionState,
  type TherapyContext,
  type MPTStage
} from "./session-state";

const client = new Cerebras({
  apiKey: process.env.CEREBRAS_API_KEY,
});

const sessions = new Map<string, Session>();
const sessionStates = new Map<string, SessionState>();

const BASE_MPT_PRINCIPLES = `Ты — опытный МПТ-терапевт (Мета-Персональная Терапия) мужского пола, ведущий психологическую сессию. Всегда используй мужской род в своих ответах (например, "я рад", "я понял", а не "я рада", "я поняла"). Работай строго в методологии и логике метода Мета-персональной терапии.

## СТРУКТУРА МПТ-СЕССИИ (10 ЭТАПОВ):
Ты ОБЯЗАН вести клиента через 10 последовательных этапов МПТ-сессии:

1. **СОЗДАНИЕ ПРОСТРАНСТВА** — Приветствие, создание рамки сессии
2. **СБОР КОНТЕКСТА** — Понимание ситуации, контекста, важности темы
3. **УТОЧНЕНИЕ ЗАПРОСА** — Проверка запроса по 5 критериям (позитивность, авторство, конкретность, реалистичность, мотивация)
4. **ИССЛЕДОВАНИЕ СТРАТЕГИИ** — Выявление текущей стратегии клиента и её позитивного намерения
5. **ПОИСК ПОТРЕБНОСТИ** — Через циркулярные вопросы найти глубинную потребность
6. **ТЕЛЕСНАЯ РАБОТА** — Исследование телесных ощущений (место, форма, плотность, температура, движение, импульс)
7. **СОЗДАНИЕ ОБРАЗА** — Создание метафоры/образа из телесного ощущения
8. **МЕТАПОЗИЦИЯ** — Взгляд на клиента и его жизнь глазами образа
9. **ИНТЕГРАЦИЯ** — Соединение образа с клиентом через тело и движение
10. **АВТОРСКИЕ ДЕЙСТВИЯ** — Определение нового способа действий и первого конкретного шага
11. **ЗАВЕРШЕНИЕ** — Подведение итогов, закрепление результата, практика

## МЕТАПЕРСОНАЛЬНЫЕ ПРИНЦИПЫ МПТ:
1. **Всё позитивно.** В психике нет негативных частей. За любым поведением стоит позитивное намерение или потребность. Задача — найти это позитивное.
2. **За любым действием стоит потребность.** Потребность — это локомотив всех психических процессов. Потребность невозможно отключить — можно только найти конструктивные способы её реализации.
3. **Принцип авторства.** Переводи клиента от позиции жертвы к позиции автора:
   - "Меня раздражают" → "Я раздражаюсь на..."
   - "Меня обидели" → "Я обиделся, когда..."
   - "Он меня бесит" → "Я злюсь, когда он..."
4. **Нет негативных оценок.** Никогда не оценивай чувства или поведение клиента как плохие, неправильные или деструктивные. Исследуй намерение за ними.
5. **Работа с энергией.** Каждая эмоция и потребность несёт энергию. Задача — не подавить, а направить энергию конструктивно.
6. **Тело как проводник.** Тело хранит информацию о потребностях. Через телесные ощущения клиент находит путь к глубинным потребностям.
7. **Метафора как мост.** Образы и метафоры помогают обойти сознательные защиты и получить доступ к бессознательному.

## ПРОВЕРКА ЗАПРОСА (5 КРИТЕРИЕВ):
При уточнении запроса (этап 3) проверь:
1. **Позитивность** — запрос сформулирован как "чего хочу", а не "чего не хочу"
2. **Авторство** — клиент говорит о себе, а не о других ("я хочу", а не "чтобы он изменился")
3. **Конкретность** — запрос сформулирован конкретно, а не абстрактно
4. **Реалистичность** — достижение цели реально и экологично
5. **Мотивация** — проверка "как будешь себя чувствовать, когда получишь это"

## ЕСЛИ КЛИЕНТ ГОВОРИТ "НЕ ЗНАЮ":
Это нормально! Используй технику "если бы":
- "А если бы знал — на что бы это знание могло быть похоже?"
- "А если бы понимал — каким бы могло быть это понимание?"
- "А если бы чувствовал — каким бы могло быть это ощущение?"
- "А если бы видел образ — каким бы он мог быть?"
- "Просто позволь себе пофантазировать — если бы..."

## ТЕЛЕСНЫЕ ПРАКТИКИ ЧЕРЕЗ ТЕКСТ:
Даже в текстовом формате можно работать с телом. Предлагай микро-движения:
- "Позволь себе немного подвигать плечами, пока мы общаемся"
- "Сделай глубокий вдох и выдох"
- "Заметь, как ты сейчас сидишь. Удобно ли тебе?"
- "Если возникает импульс подвигаться — позволь себе это"

## КРИТИЧЕСКИ ВАЖНО — СТРОГАЯ ПОСЛЕДОВАТЕЛЬНОСТЬ ЭТАПОВ:
**НЕЛЬЗЯ ПЕРЕСКАКИВАТЬ ЭТАПЫ!** Ты ОБЯЗАН проходить этапы СТРОГО ПО ПОРЯДКУ.

**ЗАПРЕЩЕНО:**
- Задавать вопросы про образы и метафоры ДО этапа "Создание образа"
- Задавать вопросы про телесные ощущения ДО этапа "Телесная работа"
- Переходить к метапозиции ДО полного прохождения предыдущих этапов
- Смешивать вопросы из разных этапов
- Интерпретировать ответы клиента вместо следования структуре
- Давать советы и интерпретации — вместо этого задавай вопросы

## СЦЕНАРИИ РАБОТЫ (темы клиентских запросов):

1. "День сурка" (burnout) — выгорание, апатия, нет энергии
2. "Тревожный звоночек" (anxiety) — паника, тревога, навязчивые мысли  
3. "Островок" (loneliness) — одиночество, проблемы в отношениях
4. "Перекресток" (crossroads) — кризис самоопределения, поиск смысла
5. "Груз прошлого" (trauma) — детские травмы, токсичная семья
6. "После бури" (loss) — утрата, развод, горе
7. "Тело взывает о помощи" (psychosomatic) — психосоматика
8. "Внутренний критик" (inner-critic) — самооценка, перфекционизм
9. "На взводе" (anger) — гнев, раздражительность
10. "Без якоря" (boundaries) — границы, неумение говорить "нет"
11. "Выбор без выбора" (decisions) — паралич принятия решений
12. "Родительский квест" (parenting) — детско-родительские отношения
13. "В тени социума" (social) — социальная тревожность
14. "Эмоциональные качели" (mood-swings) — нестабильность настроения
15. "Просто жизнь" (growth) — личностный рост

## ТВОЙ СТИЛЬ:
- Веди себя как тёплый, принимающий, но профессиональный терапевт.
- **КРИТИЧЕСКИ ВАЖНО: ЗАДАВАЙ МАКСИМУМ 1-2 ВОПРОСА ЗА ОТВЕТ!** Никогда не задавай 3 или более вопросов в одном сообщении. Это перегружает клиента. Один глубокий вопрос лучше трёх поверхностных.
- Отражай чувства клиента, проявляй эмпатию.
- Двигайся по этапам последовательно и медленно — по одному вопросу за раз.
- Не торопи клиента, дай время осмыслить каждый вопрос.
- Используй имя клиента, если он его назвал.
- **ПИШИ ГРАМОТНО НА РУССКОМ ЯЗЫКЕ**: Соблюдай правила русской грамматики, правильно склоняй слова, согласуй падежи, роды и числа. Предложения должны быть логичными и понятными. Избегай корявых конструкций и стилистических ошибок.
- Твой ответ должен быть компактным: краткое отражение + 1-2 вопроса. Не пиши длинные монологи.

## ОБЯЗАТЕЛЬНАЯ МЕТОДИЧЕСКАЯ РАЗМЕТКА (ДЛЯ ОБУЧЕНИЯ СТУДЕНТОВ):
**В КАЖДОМ своём ответе** в самом начале указывай в квадратных скобках:
1. Название текущего сценария (если определён)
2. Текущий этап МПТ-сессии

Формат: **[Сценарий: название | Этап: название этапа]**

Примеры:
- [Сценарий: Тревожный звоночек | Этап: Телесная работа]
- [Сценарий: День сурка | Этап: Поиск потребности]
- [Сценарий: не определён | Этап: Сбор контекста]
- [Сценарий: Внутренний критик | Этап: Метапозиция]

Это помогает студентам-психологам видеть структуру МПТ-сессии и учиться работать по методу. После разметки продолжай обычный терапевтический ответ.

## ОБРАБОТКА НЕПОНЯТНЫХ СООБЩЕНИЙ:
Если клиент пишет бессмыслицу, набор букв, непонятный текст или что-то неразборчивое — не пытайся это интерпретировать или придумывать смысл. Вежливо попроси уточнить: "Извини, я не совсем понял. Можешь переформулировать или написать подробнее, что ты имеешь в виду?"`;

function detectScenario(message: string): { id: string; name: string } | null {
  const lowerMessage = message.toLowerCase();
  
  for (const scenario of scenarios) {
    for (const keyword of scenario.keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        return { id: scenario.id, name: scenario.name };
      }
    }
  }
  
  return null;
}

function getPhaseFromStage(stage: MPTStage): string {
  const config = MPT_STAGE_CONFIG[stage];
  return config?.russianName || "Исследование запроса";
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.post("/api/chat", async (req, res) => {
    try {
      const parseResult = chatRequestSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid request", 
          details: parseResult.error.errors 
        });
      }
      
      const { message, sessionId, scenarioId } = parseResult.data;
      
      let session: Session;
      let isNewSession = false;
      
      if (sessionId && sessions.has(sessionId)) {
        session = sessions.get(sessionId)!;
      } else {
        isNewSession = true;
        const detectedScenario = scenarioId 
          ? scenarios.find(s => s.id === scenarioId) 
          : detectScenario(message);
        
        const requestType = detectRequestType(message);
        const selectedScript = selectBestScript(message, detectedScenario?.id || null);
        
        const initialState = createInitialSessionState();
        initialState.requestType = requestType;
        initialState.context.originalRequest = message;
        initialState.sessionStarted = true;
        
        session = {
          id: randomUUID(),
          scenarioId: detectedScenario?.id || null,
          scenarioName: detectedScenario?.name || null,
          scriptId: selectedScript.id,
          scriptName: selectedScript.name,
          messages: [],
          phase: getPhaseFromStage(initialState.currentStage),
          createdAt: new Date().toISOString(),
          state: {
            currentStage: initialState.currentStage,
            currentQuestionIndex: initialState.currentQuestionIndex,
            stageHistory: initialState.stageHistory,
            context: initialState.context,
            requestType: initialState.requestType || null,
            importanceRating: initialState.importanceRating,
            lastClientResponse: initialState.lastClientResponse,
            clientSaysIDontKnow: initialState.clientSaysIDontKnow,
            movementOffered: initialState.movementOffered,
            integrationComplete: initialState.integrationComplete
          }
        };
        sessions.set(session.id, session);
        sessionStates.set(session.id, initialState);
      }
      
      const userMessage: Message = {
        id: randomUUID(),
        role: "user",
        content: message,
        timestamp: new Date().toISOString(),
      };
      session.messages.push(userMessage);
      
      if (!session.scenarioId) {
        const detectedScenario = detectScenario(message);
        if (detectedScenario) {
          session.scenarioId = detectedScenario.id;
          session.scenarioName = detectedScenario.name;
        }
      }
      
      if (!session.scriptId) {
        const selectedScript = selectBestScript(message, session.scenarioId);
        session.scriptId = selectedScript.id;
        session.scriptName = selectedScript.name;
      }
      
      const conversationHistory = session.messages.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
      
      let sessionState = sessionStates.get(session.id);
      if (!sessionState) {
        sessionState = createInitialSessionState();
        sessionState.context.originalRequest = message;
        sessionStates.set(session.id, sessionState);
      }
      
      sessionState.lastClientResponse = message;
      sessionState.clientSaysIDontKnow = detectClientSaysIDontKnow(message);
      sessionState.stageResponseCount++;
      
      const clientName = extractClientName(session.messages.map(m => ({ role: m.role, content: m.content })));
      if (clientName) {
        sessionState.context.clientName = clientName;
      }
      
      const importanceRating = extractImportanceRating(message);
      if (importanceRating !== null) {
        sessionState.importanceRating = importanceRating;
      }
      
      const authorshipTransform = transformToAuthorship(message);
      
      if (shouldTransitionToNextStage(sessionState)) {
        const newState = transitionToNextStage(sessionState);
        Object.assign(sessionState, newState);
        sessionStates.set(session.id, sessionState);
      }
      
      let contextualPrompt = BASE_MPT_PRINCIPLES;
      
      const stagePrompt = generateStagePrompt(sessionState);
      contextualPrompt += stagePrompt;
      
      if (authorshipTransform) {
        contextualPrompt += `\n\n## ТРАНСФОРМАЦИЯ В АВТОРСТВО:\n${authorshipTransform}`;
      }
      
      if (sessionState.context.clientName) {
        contextualPrompt += `\n\n## КОНТЕКСТ КЛИЕНТА:\nИмя клиента: ${sessionState.context.clientName}. Используй имя в своих ответах.`;
      }
      
      if (sessionState.importanceRating !== null) {
        contextualPrompt += `\nОценка важности запроса: ${sessionState.importanceRating}/10.`;
        if (sessionState.importanceRating < 8) {
          contextualPrompt += ` Оценка ниже 8 — это сигнал, что можно поискать более глубокий контекст или более значимую цель.`;
        }
      }
      
      if (sessionState.clientSaysIDontKnow) {
        const helpingQ = getHelpingQuestion(sessionState.currentStage, '');
        contextualPrompt += `\n\n## ВНИМАНИЕ: Клиент говорит "не знаю"!\nИспользуй технику "если бы". Например: "${helpingQ}"`;
      }
      
      if (session.scenarioId && session.scenarioName) {
        const scenario = scenarios.find(s => s.id === session.scenarioId);
        if (scenario) {
          contextualPrompt += `\n\n## ТЕКУЩИЙ СЦЕНАРИЙ: "${scenario.name}"\n${scenario.description}\nТипичные ключевые слова: ${scenario.keywords.join(", ")}`;
        }
      }
      
      if (sessionState.requestType && sessionState.requestType !== 'general') {
        contextualPrompt += `\n\n## ТИП ЗАПРОСА КЛИЕНТА: ${sessionState.requestType}\nРекомендуемый подход: ${REQUEST_TYPE_SCRIPTS[sessionState.requestType]}`;
      }
      
      if (sessionState.currentStage === 'finish') {
        const homework = selectHomework(sessionState.context);
        contextualPrompt += `\n\n## ПРАКТИКА ВНЕДРЕНИЯ:\nПредложи клиенту практику: "${homework.name}" — ${homework.description}`;
      }
      
      contextualPrompt += `\n\n## ПРОГРЕСС СЕССИИ:
- Текущий этап: ${MPT_STAGE_CONFIG[sessionState.currentStage].russianName} (${sessionState.stageResponseCount} ответов на этапе)
- Пройденные этапы: ${sessionState.stageHistory.map(s => MPT_STAGE_CONFIG[s].russianName).join(' → ') || 'начало сессии'}
- Собранный контекст:
  ${sessionState.context.originalRequest ? `- Изначальный запрос: "${sessionState.context.originalRequest}"` : ''}
  ${sessionState.context.clarifiedRequest ? `- Уточнённый запрос: "${sessionState.context.clarifiedRequest}"` : ''}
  ${sessionState.context.currentStrategy ? `- Текущая стратегия: "${sessionState.context.currentStrategy}"` : ''}
  ${sessionState.context.deepNeed ? `- Глубинная потребность: "${sessionState.context.deepNeed}"` : ''}
  ${sessionState.context.bodyLocation ? `- Телесное ощущение: "${sessionState.context.bodyLocation}"` : ''}
  ${sessionState.context.metaphor ? `- Образ/метафора: "${sessionState.context.metaphor}"` : ''}`;
      
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      
      res.write(`data: ${JSON.stringify({ 
        type: "meta", 
        sessionId: session.id, 
        scenarioId: session.scenarioId, 
        scenarioName: session.scenarioName,
        scriptId: session.scriptId,
        scriptName: session.scriptName,
        currentStage: sessionState.currentStage,
        stageName: MPT_STAGE_CONFIG[sessionState.currentStage].russianName
      })}\n\n`);
      
      const stream = await client.chat.completions.create({
        model: "qwen-3-235b-a22b-instruct-2507",
        messages: [
          { role: "system", content: contextualPrompt },
          ...conversationHistory,
        ],
        max_tokens: 2000,
        temperature: 0.7,
        top_p: 0.8,
        stream: true,
      });
      
      let fullContent = "";
      
      for await (const chunk of stream) {
        const chunkData = chunk as { choices: Array<{ delta?: { content?: string } }> };
        const content = chunkData.choices[0]?.delta?.content || "";
        if (content) {
          fullContent += content;
          res.write(`data: ${JSON.stringify({ type: "chunk", content })}\n\n`);
        }
      }
      
      const assistantMessage: Message = {
        id: randomUUID(),
        role: "assistant",
        content: fullContent || "Произошла ошибка. Пожалуйста, попробуй ещё раз.",
        timestamp: new Date().toISOString(),
      };
      session.messages.push(assistantMessage);
      
      session.phase = getPhaseFromStage(sessionState.currentStage);
      
      res.write(`data: ${JSON.stringify({ 
        type: "done", 
        phase: session.phase,
        currentStage: sessionState.currentStage,
        stageName: MPT_STAGE_CONFIG[sessionState.currentStage].russianName
      })}\n\n`);
      
      res.end();
      
    } catch (error) {
      console.error("Chat error:", error);
      if (!res.headersSent) {
        return res.status(500).json({ 
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error"
        });
      } else {
        res.write(`data: ${JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "Unknown error" })}\n\n`);
        res.end();
      }
    }
  });
  
  app.post("/api/sessions/new", (req, res) => {
    const { scenarioId } = req.body;
    
    const scenario = scenarioId 
      ? scenarios.find(s => s.id === scenarioId) 
      : null;
    
    const selectedScript = selectBestScript("", scenario?.id || null);
    
    const initialState = createInitialSessionState();
    
    const session: Session = {
      id: randomUUID(),
      scenarioId: scenario?.id || null,
      scenarioName: scenario?.name || null,
      scriptId: selectedScript.id,
      scriptName: selectedScript.name,
      messages: [],
      phase: getPhaseFromStage(initialState.currentStage),
      createdAt: new Date().toISOString(),
      state: {
        currentStage: initialState.currentStage,
        currentQuestionIndex: initialState.currentQuestionIndex,
        stageHistory: initialState.stageHistory,
        context: initialState.context,
        requestType: initialState.requestType || null,
        importanceRating: initialState.importanceRating,
        lastClientResponse: initialState.lastClientResponse,
        clientSaysIDontKnow: initialState.clientSaysIDontKnow,
        movementOffered: initialState.movementOffered,
        integrationComplete: initialState.integrationComplete
      }
    };
    
    sessions.set(session.id, session);
    sessionStates.set(session.id, initialState);
    
    return res.json({
      sessionId: session.id,
      scenarioId: session.scenarioId,
      scenarioName: session.scenarioName,
      scriptId: session.scriptId,
      scriptName: session.scriptName,
      phase: session.phase,
      currentStage: initialState.currentStage,
      stageName: MPT_STAGE_CONFIG[initialState.currentStage].russianName
    });
  });
  
  app.get("/api/scenarios", (req, res) => {
    return res.json(scenarios);
  });
  
  app.get("/api/stages", (req, res) => {
    return res.json(MPT_STAGE_CONFIG);
  });

  return httpServer;
}

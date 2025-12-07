export interface TherapyContext {
  clientName: string | null;
  currentGoal: string | null;
  deepNeed: string | null;
  bodyLocation: string | null;
  metaphor: string | null;
  energyLevel: number | null;
  newActions: string[];
  homework: string | null;
  stageData: Record<string, string>;
}

export interface SessionState {
  currentStageIndex: number;
  currentQuestionIndex: number;
  stageHistory: string[];
  context: TherapyContext;
  requestType: RequestType | null;
  importanceRating: number | null;
  lastClientResponse: string;
  clientSaysIDontKnow: boolean;
  movementOffered: boolean;
  integrationComplete: boolean;
}

export type RequestType = 
  | 'relationships'
  | 'fear'
  | 'resistance'
  | 'energy_loss'
  | 'goal'
  | 'trauma'
  | 'identity'
  | 'conflict'
  | 'habits'
  | 'psychosomatic'
  | 'general';

export const REQUEST_TYPE_KEYWORDS: Record<RequestType, string[]> = {
  relationships: [
    'отношения', 'партнер', 'муж', 'жена', 'девушка', 'парень', 'брак', 
    'любовь', 'расставание', 'развод', 'ссоры', 'конфликты в паре'
  ],
  fear: [
    'страх', 'боюсь', 'тревога', 'паника', 'волнуюсь', 'страшно', 
    'фобия', 'беспокойство', 'навязчивые мысли'
  ],
  resistance: [
    'сопротивление', 'не могу начать', 'прокрастинация', 'откладываю',
    'не хочется', 'заставляю себя', 'нет мотивации'
  ],
  energy_loss: [
    'устал', 'нет сил', 'выгорание', 'апатия', 'энергии нет',
    'истощение', 'опустошен', 'выжат', 'burnout'
  ],
  goal: [
    'цель', 'не знаю чего хочу', 'мечта', 'достичь', 'реализовать',
    'успех', 'карьера', 'деньги', 'бизнес'
  ],
  trauma: [
    'травма', 'детство', 'родители', 'обида', 'прошлое', 'воспоминания',
    'больно', 'не отпускает', 'токсичные'
  ],
  identity: [
    'кто я', 'не знаю себя', 'потерял себя', 'смысл жизни', 'предназначение',
    'идентичность', 'самоопределение'
  ],
  conflict: [
    'конфликт', 'ссора', 'раздражает', 'злюсь', 'бесит', 'ненавижу',
    'не выношу', 'агрессия'
  ],
  habits: [
    'привычка', 'зависимость', 'не могу бросить', 'повторяю', 'паттерн',
    'автоматически', 'снова и снова'
  ],
  psychosomatic: [
    'болит', 'тело', 'психосоматика', 'симптом', 'здоровье', 'напряжение',
    'зажим', 'блок', 'спина', 'голова'
  ],
  general: []
};

export function detectRequestType(message: string): RequestType {
  const lowerMessage = message.toLowerCase();
  
  for (const [type, keywords] of Object.entries(REQUEST_TYPE_KEYWORDS)) {
    if (type === 'general') continue;
    for (const keyword of keywords) {
      if (lowerMessage.includes(keyword)) {
        return type as RequestType;
      }
    }
  }
  
  return 'general';
}

export function detectClientSaysIDontKnow(message: string): boolean {
  const patterns = [
    'не знаю',
    'не понимаю',
    'не чувствую',
    'не могу ответить',
    'затрудняюсь',
    'не уверен',
    'не ощущаю',
    'не вижу',
    'непонятно',
    'сложно сказать',
    'не могу сформулировать'
  ];
  
  const lowerMessage = message.toLowerCase();
  return patterns.some(pattern => lowerMessage.includes(pattern));
}

export function getHelpingQuestion(originalQuestion: string): string {
  if (originalQuestion.includes('чувству') || originalQuestion.includes('ощущ')) {
    return 'А если бы ты чувствовал — каким бы могло быть это ощущение? Позволь себе представить.';
  }
  if (originalQuestion.includes('понима') || originalQuestion.includes('думаешь')) {
    return 'А если бы понимал — каким бы могло быть это понимание? Что первое приходит в голову?';
  }
  if (originalQuestion.includes('вид') || originalQuestion.includes('образ') || originalQuestion.includes('метафор')) {
    return 'А если бы видел — на что бы это могло быть похоже? Какой образ мог бы возникнуть?';
  }
  return 'А если бы знал — на что бы это знание могло быть похоже? Что первое приходит на ум?';
}

export function extractClientName(messages: Array<{role: string, content: string}>): string | null {
  const patterns = [
    /меня зовут (\p{L}+)/iu,
    /зови меня (\p{L}+)/iu,
    /можешь звать меня (\p{L}+)/iu,
    /моё? имя (\p{L}+)/iu,
    /имя[:\s]+(\p{L}+)/iu,
    /я — (\p{L}+)/iu,
    /привет,?\s+я (\p{L}+)/iu
  ];
  
  const stopWords = [
    'я', 'мне', 'меня', 'мой', 'моя', 'моё', 'это', 'что', 'как', 'так',
    'хочу', 'могу', 'буду', 'должен', 'чувствую', 'думаю', 'понимаю',
    'знаю', 'вижу', 'слышу', 'делаю', 'говорю', 'считаю', 'помню',
    'люблю', 'ненавижу', 'боюсь', 'хотел', 'была', 'был', 'есть',
    'тоже', 'очень', 'просто', 'тут', 'там', 'здесь', 'сейчас',
    'всегда', 'никогда', 'иногда', 'часто', 'редко', 'давно',
    'рад', 'рада', 'готов', 'готова', 'согласен', 'согласна'
  ];
  
  for (const msg of messages) {
    if (msg.role === 'user') {
      for (const pattern of patterns) {
        const match = msg.content.match(pattern);
        if (match && match[1].length >= 2 && match[1].length <= 20) {
          const name = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
          if (!stopWords.includes(name.toLowerCase())) {
            return name;
          }
        }
      }
    }
  }
  return null;
}

export function extractImportanceRating(message: string): number | null {
  const patterns = [
    /(\d{1,2})\s*(из|\/)\s*10/i,
    /на\s*(\d{1,2})/i,
    /оцениваю[^\d]*(\d{1,2})/i,
    /^(\d{1,2})$/
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      const num = parseInt(match[1]);
      if (num >= 1 && num <= 10) {
        return num;
      }
    }
  }
  return null;
}

export function createInitialSessionState(): SessionState {
  return {
    currentStageIndex: 0,
    currentQuestionIndex: 0,
    stageHistory: [],
    context: {
      clientName: null,
      currentGoal: null,
      deepNeed: null,
      bodyLocation: null,
      metaphor: null,
      energyLevel: null,
      newActions: [],
      homework: null,
      stageData: {}
    },
    requestType: null,
    importanceRating: null,
    lastClientResponse: '',
    clientSaysIDontKnow: false,
    movementOffered: false,
    integrationComplete: false
  };
}

export const IMPLEMENTATION_PRACTICES = [
  {
    id: 'morning-connection',
    name: 'Утреннее соединение',
    description: 'Каждое утро 5 минут вспоминай найденный образ и соединяйся с ним. Позволь ему наполнить тебя энергией на весь день.'
  },
  {
    id: 'anchor-word',
    name: 'Слово-якорь',
    description: 'Выбери одно слово, которое описывает твоё ресурсное состояние. Произноси его про себя каждый раз, когда чувствуешь необходимость в поддержке.'
  },
  {
    id: 'body-check',
    name: 'Телесная проверка',
    description: 'Три раза в день останавливайся и замечай, что происходит в теле. Если есть напряжение — позволь телу немного подвигаться.'
  },
  {
    id: 'evening-review',
    name: 'Вечерний пересмотр',
    description: 'Перед сном вспомни моменты дня, когда ты действовал из нового состояния. Отметь даже маленькие изменения.'
  },
  {
    id: 'new-action',
    name: 'Одно новое действие',
    description: 'Каждый день делай хотя бы одно маленькое действие из нового состояния. Фиксируй результаты.'
  },
  {
    id: 'metaphor-journal',
    name: 'Дневник метафоры',
    description: 'Записывай, как твой образ-ресурс проявляется в разных ситуациях. Замечай, когда он рядом.'
  },
  {
    id: 'breath-anchor',
    name: 'Дыхательный якорь',
    description: 'Когда нужна поддержка — сделай три глубоких вдоха, представляя, что вдыхаешь энергию найденного состояния.'
  },
  {
    id: 'trigger-practice',
    name: 'Работа с триггерами',
    description: 'Замечай ситуации, которые вызывают старые реакции. В этот момент вспоминай новое состояние и выбирай новый способ реагирования.'
  }
];

export function selectHomework(context: TherapyContext): typeof IMPLEMENTATION_PRACTICES[0] {
  if (context.metaphor) {
    return IMPLEMENTATION_PRACTICES.find(p => p.id === 'metaphor-journal')!;
  }
  if (context.bodyLocation) {
    return IMPLEMENTATION_PRACTICES.find(p => p.id === 'body-check')!;
  }
  if (context.newActions.length > 0) {
    return IMPLEMENTATION_PRACTICES.find(p => p.id === 'new-action')!;
  }
  return IMPLEMENTATION_PRACTICES.find(p => p.id === 'morning-connection')!;
}

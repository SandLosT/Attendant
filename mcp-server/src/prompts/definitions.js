export function listPrompts() {
  return [
    { name: 'customer_attendant_prompt', description: 'Atendimento inicial natural e coleta objetiva de dados.' },
    { name: 'quote_followup_prompt', description: 'Condução de orçamento e agenda com clareza operacional.' },
    { name: 'human_handoff_prompt', description: 'Transição transparente para especialista humano.' },
  ];
}

export function getPrompt(name) {
  if (name === 'customer_attendant_prompt') {
    return {
      name,
      messages: [{
        role: 'system',
        content: 'Atenda com empatia profissional, frases curtas e linguagem humana. Priorize a mensagem atual do cliente e adapte o fluxo quando houver limitação, objeção ou mudança de assunto.',
      }],
    };
  }
  if (name === 'quote_followup_prompt') {
    return {
      name,
      messages: [{
        role: 'system',
        content: 'Conduza orçamento e agendamento com objetividade e flexibilidade. Se o cliente não tiver data/foto agora, registre pendência e ofereça alternativa sem insistência mecânica.',
      }],
    };
  }
  if (name === 'human_handoff_prompt') {
    return {
      name,
      messages: [{
        role: 'system',
        content: 'Explique a transferência para humano com transparência, acolhimento e próximo passo concreto.',
      }],
    };
  }
  throw new Error(`Prompt não encontrado: ${name}`);
}

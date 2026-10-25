# Busmap Ap

BusMap Macapá — Aplicativo colaborativo de ônibus em tempo real

Crie do zero uma aplicação web responsiva chamada BusMap Macapá, para consulta de rotas e acompanhamento colaborativo de ônibus em Macapá, Amapá. O objetivo é permitir que passageiros compartilhem voluntariamente suas posições GPS para ajudar outras pessoas a entender onde há ônibus circulando.

Construa um produto funcional, mobile-first, em português brasileiro, conectado a banco de dados real. Não use dados simulados como se fossem reais. Priorize segurança, privacidade, baixo consumo de recursos e uma interface simples para celulares.

1. Tecnologias

Utilize React, TypeScript, Leaflet, OpenStreetMap, Supabase (PostgreSQL, Auth, Realtime e RLS), Geolocation API e OSRM ou serviço equivalente para calcular trajetos. Organize o código em componentes reutilizáveis e utilize as integrações nativas disponíveis na plataforma. Se uma tecnologia não estiver disponível, explique a alternativa antes de comprometer os requisitos.

2. Mapa público

A página inicial deve funcionar sem cadastro e apresentar:

- Mapa centralizado em Macapá, com rotas publicadas em cores distintas.
- Filtros por linha, detalhes de rota, origem, destino e distância aproximada.
- Marcadores de posições colaborativas recentes, horário da atualização e estado do sinal.
- Quantidade de rotas e compartilhamentos ativos.
- Opção para centralizar o mapa na localização do visitante, mediante permissão.
- Mensagens claras quando não houver rotas ou posições disponíveis.

Carregue rotas e posições do banco. Atualize o mapa em tempo real sem recarregá-lo integralmente. Nunca invente ônibus, coordenadas ou informações oficiais. Deixe explícito que são posições colaborativas, não rastreamento oficial de uma empresa de transporte.

3. Compartilhamento GPS

Permita que qualquer visitante compartilhe sua localização sem criar conta.

Fluxo: selecionar uma linha, receber explicação sobre o uso dos dados, conceder permissão de GPS e confirmar o compartilhamento. Exiba claramente quando ele estiver ativo e disponibilize um botão para interrompê-lo imediatamente.

Envie atualizações em intervalos controlados pelo backend. Trate permissões negadas, GPS indisponível, perda de conexão, reconexão, coordenadas inválidas, precisão insuficiente, limitação de requisições e encerramento da sessão. Considere a sessão inativa após 60 segundos sem atualização, com parâmetro configurável no backend.

Tela bloqueada e segundo plano: implemente a melhor continuidade possível e avalie explicitamente as limitações de navegadores e PWA em Android e iOS. Não presuma que um site consiga manter o GPS ativo com a tela bloqueada. Se necessário, apresente uma arquitetura híbrida/nativa como evolução para obter maior confiabilidade. Nunca mostre uma sessão como ativa se as atualizações cessaram.

4. Vários colaboradores e posição representativa

Permita até cinco colaboradores simultâneos por grupo de ônibus, com limite validado no backend.

Se já houver colaboradores ativos, pergunte ao visitante se deseja contribuir para melhorar o acompanhamento. Se não houver, apresente o convite normal para compartilhar.

O mapa deve mostrar apenas um marcador representativo por ônibus/grupo, e não um marcador sobreposto para cada pessoa. O backend deve agrupar colaboradores somente quando posição, horário, precisão e deslocamento forem compatíveis. Ônibus diferentes na mesma linha devem continuar separados.

Mostre no detalhe quantos colaboradores estão contribuindo. Calcule a posição representativa a partir de dados recentes e válidos; quando houver divergências ou incerteza, sinalize isso, sem inventar precisão. Não revele nomes reais, contatos ou identificadores técnicos.

5. Última posição e convite para continuar

Quando todos os colaboradores de um grupo encerrarem a sessão ou deixarem de atualizar a localização, mantenha temporariamente a última posição conhecida como desatualizada, com o horário da última atualização. Ela não pode continuar sendo apresentada como posição ativa. Configure a retenção e a expiração no backend.

Ao encontrar uma posição antiga sem colaboradores ativos, pergunte ao visitante se deseja ajudar a atualizar a localização e contribuir com a comunidade. Após consentimento para acessar o GPS, compare a posição atual com a última posição conhecida e o trajeto esperado, considerando a precisão e limites configuráveis.

Associe o novo compartilhamento ao grupo anterior somente quando houver evidências geográficas suficientes. Caso contrário, inicie uma contribuição independente ou solicite a seleção de outra linha. Proximidade não comprova que a pessoa está dentro do ônibus; nunca faça essa afirmação.

6. Cadastro opcional e perfil

Implemente cadastro, login, recuperação de senha e logout usando Supabase Auth. O mapa e o compartilhamento continuam públicos.

Visitantes devem receber um identificador aleatório protegido por segredo, armazenado localmente quando possível. Informe que o progresso anônimo pode ser perdido ao limpar dados do navegador, reinstalar ou trocar de dispositivo.

Permita vincular progresso anônimo a uma conta apenas quando houver comprovação segura de controle da sessão. Não aceite identificadores públicos como prova de propriedade.

O perfil autenticado deve incluir apelido público opcional, preferência de anonimato, nível, experiência, medalhas, progresso para o próximo nível, sessões válidas, conquistas, data de entrada e histórico resumido. Não publique histórico detalhado de deslocamentos. Implemente exclusão de conta e tratamento adequado dos dados pessoais.

7. Gamificação e confiabilidade

Crie níveis Bronze (Iniciante), Prata (Colaborador), Ouro (Explorador) e Platina (Embaixador), com XP, medalhas, barra de progresso e conquistas.

A pontuação deve ser calculada exclusivamente no backend por sessão validada, considerando duração efetiva, continuidade, regularidade e qualidade dos dados. Não pontue cada coordenada como uma nova contribuição. Implemente limites contra duplicidade, abuso, velocidades impossíveis e acumulação artificial. Sessões inconclusivas ficam pendentes, sem pontuação automática nem punição apenas por GPS impreciso.

Exiba quatro indicadores independentes:

- Experiência: nível e histórico de colaboração.
- Atualidade: idade da posição.
- Sinal: precisão GPS e consistência das coordenadas.
- Validação: resultado das verificações da sessão.

O nível nunca deve garantir a precisão da localização. Para visitantes, mostre “Colaborador anônimo”, sem reputação persistente que não possa ser comprovada.

8. Administração exclusiva do criador 
ícone da engrenagem ,  mas que aceite somente meu login com maicon.x4@gmail.com
Crie uma área privada "/admin" para gerenciar rotas, configurações e indicadores do sistema. Somente a identidade do criador, explicitamente provisionada por procedimento seguro, pode acessar operações administrativas.

Utilize Supabase Auth, verificação de autorização no servidor e RLS no banco. Não ofereça cadastro público de administradores, não confie apenas em restrições visuais e não exponha chaves privilegiadas no navegador. Passageiros e visitantes nunca podem alterar rotas, configurações, pontuação ou permissões.

O painel deve mostrar rotas cadastradas/publicadas, sessões ativas, contribuições e estado dos serviços.

9. Editor de rotas

Ofereça dois modos:

A — Origem e destino: o administrador informa nome, código, descrição, cor, sentido, origem e destino. O sistema calcula um trajeto pelas vias com OSRM ou equivalente e apresenta uma prévia editável.

B — Desenho manual: permite adicionar, mover e excluir pontos, desfazer/refazer, limpar o traçado, estimar distância e salvar uma prévia. Deve funcionar mesmo sem o serviço de roteamento.

Permita criar rascunhos, editar, publicar, desativar e excluir rotas. Armazene identificador, código, nome, descrição, cor, coordenadas de origem/destino, geometria ordenada, sentido, método de criação, estado e datas. Rascunhos são privados; somente rotas publicadas aparecem no mapa público.

10. Banco de dados e regras de segurança

Use PostgreSQL no Supabase. Crie estrutura normalizada, chaves estrangeiras, índices, restrições e políticas RLS específicas. Inclua, no mínimo, estruturas para rotas, perfis, sessões de localização, atualizações GPS, contribuições, progresso, conquistas, usuários administrativos e configurações.

Implemente funções seguras no backend para iniciar, atualizar e encerrar sessões; validar contribuições; calcular XP e níveis; agrupar posições; verificar autorização administrativa; e expirar dados antigos. Disponibilize ao mapa somente os campos mínimos necessários, nunca o histórico pessoal completo.

Configure uma rotina confiável de limpeza de sessões expiradas e coordenadas antigas. Não presuma que uma função de limpeza é executada automaticamente apenas por existir.

Proteja contra falsificação de coordenadas, duplicidade, abuso de RPCs, roubo de sessão, acesso indevido, alteração de pontuação e consultas públicas excessivas. Nunca coloque segredos no frontend.

11. Privacidade e LGPD

Solicite consentimento explícito antes de compartilhar GPS, informe a finalidade, permita interromper a coleta e limite a retenção das coordenadas. Implemente política de privacidade coerente com o funcionamento real, exclusão ou anonimização quando aplicável e mecanismos para proteger dados pessoais. Não exponha publicamente a localização histórica individual de um colaborador.

12. Entrega e validação

Construa a aplicação completa, incluindo frontend, banco, políticas RLS, funções backend, autenticação, editor administrativo e atualização em tempo real. Execute testes, lint e build disponíveis. Verifique especialmente autorização administrativa, limites de colaboradores, expiração, privacidade, validação GPS e regras de agrupamento.

Não declare recursos como concluídos apenas porque existem componentes visuais. Diferencie o que foi implementado, o que passou em testes automáticos, o que foi validado no banco e o que depende de configuração externa ou teste manual. Não invente resultados de testes, não exponha segredos e não realize operações destrutivas.

Ao final, apresente um resumo das funcionalidades implementadas, configurações necessárias e limitações reais, principalmente do GPS em segundo plano.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://busmap-ap.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/790b7e03-f21e-4e2a-aac9-36ade90bcaed).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

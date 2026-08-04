/* Brazilian states (UF) and their main cities.
   Used by the search page to populate the State (UF) and City selects.
   Cities are ordered by population (largest first) to match what users expect.
*/
window.BrazilLocations = (function () {
  const data = [
    { uf: 'AC', name: 'Acre', cities: ['Rio Branco', 'Cruzeiro do Sul', 'Sena Madureira', 'Tarauacá', 'Feijó'] },
    { uf: 'AL', name: 'Alagoas', cities: ['Maceió', 'Arapiraca', 'Rio Largo', 'Palmeira dos Índios', 'União dos Palmares'] },
    { uf: 'AP', name: 'Amapá', cities: ['Macapá', 'Santana', 'Laranjal do Jari', 'Oiapoque', 'Mazagão'] },
    { uf: 'AM', name: 'Amazonas', cities: ['Manaus', 'Parintins', 'Itacoatiara', 'Manacapuru', 'Coari', 'Tefé', 'Tabatinga'] },
    { uf: 'BA', name: 'Bahia', cities: ['Salvador', 'Feira de Santana', 'Vitória da Conquista', 'Camaçari', 'Itabuna', 'Juazeiro', 'Lauro de Freitas', 'Ilhéus', 'Jequié', 'Teixeira de Freitas', 'Barreiras', 'Porto Seguro'] },
    { uf: 'CE', name: 'Ceará', cities: ['Fortaleza', 'Caucaia', 'Juazeiro do Norte', 'Maracanaú', 'Sobral', 'Crato', 'Itapipoca', 'Maranguape', 'Iguatu', 'Quixadá'] },
    { uf: 'DF', name: 'Distrito Federal', cities: ['Brasília', 'Taguatinga', 'Ceilândia', 'Plano Piloto', 'Águas Claras', 'Samambaia', 'Recanto das Emas'] },
    { uf: 'ES', name: 'Espírito Santo', cities: ['Vitória', 'Vila Velha', 'Serra', 'Cariacica', 'Linhares', 'Colatina', 'Guarapari', 'Cachoeiro de Itapemirim', 'São Mateus'] },
    { uf: 'GO', name: 'Goiás', cities: ['Goiânia', 'Aparecida de Goiânia', 'Anápolis', 'Rio Verde', 'Luziânia', 'Águas Lindas de Goiás', 'Valparaíso de Goiás', 'Trindade', 'Formosa', 'Itumbiara', 'Jataí'] },
    { uf: 'MA', name: 'Maranhão', cities: ['São Luís', 'Imperatriz', 'Timon', 'Caxias', 'Codó', 'Paço do Lumiar', 'Açailândia', 'Bacabal', 'Balsas'] },
    { uf: 'MT', name: 'Mato Grosso', cities: ['Cuiabá', 'Várzea Grande', 'Rondonópolis', 'Sinop', 'Tangará da Serra', 'Cáceres', 'Sorriso', 'Lucas do Rio Verde', 'Primavera do Leste', 'Barra do Garças'] },
    { uf: 'MS', name: 'Mato Grosso do Sul', cities: ['Campo Grande', 'Dourados', 'Três Lagoas', 'Corumbá', 'Ponta Porã', 'Naviraí', 'Nova Andradina', 'Sidrolândia', 'Maracaju'] },
    { uf: 'MG', name: 'Minas Gerais', cities: ['Belo Horizonte', 'Uberlândia', 'Contagem', 'Juiz de Fora', 'Betim', 'Montes Claros', 'Uberaba', 'Governador Valadares', 'Ipatinga', 'Poços de Caldas', 'Sete Lagoas', 'Divinópolis', 'Santa Luzia', 'Ibirité', 'Patos de Minas', 'Pouso Alegre', 'Teófilo Otoni', 'Barbacena', 'Varginha', 'Lavras', 'Itabira'] },
    { uf: 'PA', name: 'Pará', cities: ['Belém', 'Ananindeua', 'Santarém', 'Marabá', 'Castanhal', 'Parauapebas', 'Abaetetuba', 'Cametá', 'Marituba', 'Tucuruí', 'Altamira'] },
    { uf: 'PB', name: 'Paraíba', cities: ['João Pessoa', 'Campina Grande', 'Santa Rita', 'Patos', 'Bayeux', 'Sousa', 'Cajazeiras', 'Guarabira', 'Mamanguape'] },
    { uf: 'PR', name: 'Paraná', cities: ['Curitiba', 'Londrina', 'Maringá', 'Ponta Grossa', 'Cascavel', 'São José dos Pinhais', 'Foz do Iguaçu', 'Colombo', 'Guarapuava', 'Paranaguá', 'Araucária', 'Toledo', 'Apucarana', 'Pinhais', 'Campo Largo', 'Umuarama'] },
    { uf: 'PE', name: 'Pernambuco', cities: ['Recife', 'Jaboatão dos Guararapes', 'Olinda', 'Caruaru', 'Petrolina', 'Paulista', 'Cabo de Santo Agostinho', 'Camaragibe', 'Garanhuns', 'Vitória de Santo Antão', 'Igarassu'] },
    { uf: 'PI', name: 'Piauí', cities: ['Teresina', 'Parnaíba', 'Picos', 'Floriano', 'Campo Maior', 'Piripiri', 'Barras', 'Altos'] },
    { uf: 'RJ', name: 'Rio de Janeiro', cities: ['Rio de Janeiro', 'São Gonçalo', 'Duque de Caxias', 'Nova Iguaçu', 'Niterói', 'Belford Roxo', 'São João de Meriti', 'Campos dos Goytacazes', 'Petrópolis', 'Volta Redonda', 'Magé', 'Itaboraí', 'Macaé', 'Cabo Frio', 'Nova Friburgo', 'Barra Mansa', 'Angra dos Reis', 'Teresópolis', 'Resende'] },
    { uf: 'RN', name: 'Rio Grande do Norte', cities: ['Natal', 'Mossoró', 'Parnamirim', 'São Gonçalo do Amarante', 'Macaíba', 'Ceará-Mirim', 'Caicó', 'Açu', 'Currais Novos'] },
    { uf: 'RS', name: 'Rio Grande do Sul', cities: ['Porto Alegre', 'Caxias do Sul', 'Pelotas', 'Canoas', 'Santa Maria', 'Gravataí', 'Viamão', 'Novo Hamburgo', 'São Leopoldo', 'Rio Grande', 'Passo Fundo', 'Sapucaia do Sul', 'Uruguaiana', 'Santa Cruz do Sul', 'Bagé', 'Bento Gonçalves', 'Lajeado', 'Ijuí', 'Cachoeirinha', 'Santana do Livramento'] },
    { uf: 'RO', name: 'Rondônia', cities: ['Porto Velho', 'Ji-Paraná', 'Ariquemes', 'Vilhena', 'Cacoal', 'Rolim de Moura', 'Guajará-Mirim', 'Jaru'] },
    { uf: 'RR', name: 'Roraima', cities: ['Boa Vista', 'Rorainópolis', 'Caracaraí', 'Alto Alegre', 'Mucajaí'] },
    { uf: 'SC', name: 'Santa Catarina', cities: ['Florianópolis', 'Joinville', 'Blumenau', 'São José', 'Chapecó', 'Itajaí', 'Criciúma', 'Palhoça', 'Jaraguá do Sul', 'Lages', 'Balneário Camboriú', 'Brusque', 'Tubarão', 'São Bento do Sul', 'Caçador'] },
    { uf: 'SP', name: 'São Paulo', cities: ['São Paulo', 'Guarulhos', 'Campinas', 'São Bernardo do Campo', 'Santo André', 'Osasco', 'São José dos Campos', 'Ribeirão Preto', 'Sorocaba', 'Mauá', 'São Caetano do Sul', 'Mogi das Cruzes', 'Diadema', 'Jundiaí', 'Carapicuíba', 'Piracicaba', 'Bauru', 'Itaquaquecetuba', 'São Vicente', 'Franca', 'Praia Grande', 'Guarujá', 'Taubaté', 'Limeira', 'Suzano', 'Taboão da Serra', 'Sumaré', 'Barueri', 'Embu das Artes', 'Marília', 'Presidente Prudente', 'São Carlos', 'Americana', 'Araraquara', 'Jacareí', 'Hortolândia', 'Rio Claro', 'Indaiatuba', 'Cotia', 'Itapevi', 'Ferraz de Vasconcelos'] },
    { uf: 'SE', name: 'Sergipe', cities: ['Aracaju', 'Nossa Senhora do Socorro', 'Lagarto', 'Itabaiana', 'São Cristóvão', 'Estância', 'Tobias Barreto', 'Itabaianinha'] },
    { uf: 'TO', name: 'Tocantins', cities: ['Palmas', 'Araguaína', 'Gurupi', 'Porto Nacional', 'Paraíso do Tocantins', 'Colinas do Tocantins', 'Guaraí', 'Tocantinópolis'] }
  ];

  return {
    states: data.map((d) => ({ uf: d.uf, name: d.name })),
    citiesFor: function (uf) {
      const entry = data.find((d) => d.uf === uf);
      return entry ? entry.cities.slice() : [];
    },
    nameFor: function (uf) {
      const entry = data.find((d) => d.uf === uf);
      return entry ? entry.name : '';
    }
  };
})();

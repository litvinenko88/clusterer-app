document.addEventListener("DOMContentLoaded", function () {
  // DOM элементы
  const keywordsInput = document.getElementById("keywordsInput");
  const clusterButton = document.getElementById("clusterButton");
  const progressBar = document.getElementById("progressBar");
  const progressText = document.getElementById("progressText");
  const clustersContainer = document.getElementById("clustersContainer");
  const exportButton = document.getElementById("exportButton");
  const articlesContainer = document.getElementById("articlesContainer");
  const exportArticlesButton = document.getElementById("exportArticlesButton");
  const clearAllButton = document.getElementById("clearAllButton");
  const clearArticlesButton = document.getElementById("clearArticlesButton");
  const undoButton = document.getElementById("undoButton");
  const undoSection = document.getElementById("undoSection");
  const deleteSelectedButton = document.getElementById("deleteSelectedButton");
  const addSelectedToArticlesButton = document.getElementById(
    "addSelectedToArticlesButton"
  );
  const excludeSelectedButton = document.getElementById(
    "excludeSelectedButton"
  );
  const removeGeoCheckbox = document.getElementById("removeGeoCheckbox");
  const removeDupesCheckbox = document.getElementById("removeDupesCheckbox");
  const floatingActions = document.getElementById("floatingActions");
  const exclusionsInput = document.getElementById("exclusionsInput");
  const excludeButton = document.getElementById("excludeButton");
  const clearExclusionsButton = document.getElementById(
    "clearExclusionsButton"
  );
  const exclusionsList = document.getElementById("exclusionsList");

  // Состояние приложения
  let clusters = [];
  let articles = [];
  let exclusions = [];
  let lastDeletedItems = null;
  let selectedKeywords = new Set();
  let keywordUndoButtons = {};
  let selectedText = "";

  // Загрузка сохраненных данных
  loadSavedData();

  // Обработчики событий
  clusterButton.addEventListener("click", clusterKeywordsHandler);
  exportButton.addEventListener("click", exportClustersToExcel);
  exportArticlesButton.addEventListener("click", exportArticlesToExcel);
  clearAllButton.addEventListener("click", clearAllData);
  clearArticlesButton.addEventListener("click", clearArticles);
  undoButton.addEventListener("click", undoLastDelete);
  deleteSelectedButton.addEventListener("click", deleteSelectedKeywords);
  addSelectedToArticlesButton.addEventListener("click", addSelectedToArticles);
  excludeSelectedButton.addEventListener("click", excludeSelectedKeywords);
  excludeButton.addEventListener("click", addExclusions);
  clearExclusionsButton.addEventListener("click", clearExclusions);

  // Обработчик ввода текста с автосохранением
  keywordsInput.addEventListener("input", function () {
    saveToLocalStorage("keywordsInput", this.value);
  });

  // Обработчик выделения текста в кластерах
  document.addEventListener("selectionchange", function () {
    const selection = window.getSelection();
    if (
      selection.toString().trim() &&
      clustersContainer.contains(selection.anchorNode)
    ) {
      selectedText = selection.toString().trim();
    } else {
      selectedText = "";
    }
  });

  // Обработчик клика правой кнопкой мыши для добавления в исключения
  clustersContainer.addEventListener("contextmenu", function (e) {
    if (selectedText) {
      e.preventDefault();
      showExcludeContextMenu(e, selectedText);
    }
  });

  // Функция показа контекстного меню для исключения
  function showExcludeContextMenu(e, text) {
    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.innerHTML = `
      <button class="context-menu-item" id="excludeSelectedText">
        <i class="fas fa-ban"></i> Исключить "${text}"
      </button>
    `;
    menu.style.position = "absolute";
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;
    menu.style.zIndex = "1000";
    menu.style.backgroundColor = "white";
    menu.style.border = "1px solid #ddd";
    menu.style.borderRadius = "4px";
    menu.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";

    document.body.appendChild(menu);

    document
      .getElementById("excludeSelectedText")
      .addEventListener("click", function () {
        addExclusion(text);
        document.body.removeChild(menu);
      });

    // Закрытие меню при клике вне его
    const closeMenu = function (e) {
      if (!menu.contains(e.target)) {
        document.body.removeChild(menu);
        document.removeEventListener("click", closeMenu);
      }
    };

    document.addEventListener("click", closeMenu);
  }

  // Функция обработки кластеризации
  function clusterKeywordsHandler() {
    const inputText = keywordsInput.value.trim();
    if (!inputText) {
      alert("Пожалуйста, введите ключевые фразы");
      return;
    }

    simulateProgress(() => {
      const keywordsData = parseInputData(inputText);
      if (keywordsData.length === 0) {
        alert(
          "Не удалось распознать данные. Убедитесь, что данные в формате: ключевая фраза [tab] объем [tab] KD"
        );
        return;
      }

      clusters = clusterKeywords(keywordsData);
      applyExclusions();
      renderClusters();
      exportButton.disabled = false;
      saveAllData();
    });
  }

  // Функция парсинга входных данных
  function parseInputData(inputText) {
    const lines = inputText.split("\n").filter((line) => line.trim());
    const keywordsData = [];

    // Проверяем, есть ли заголовки
    const firstLine = lines[0].toLowerCase();
    const hasHeaders =
      firstLine.includes("ключ") ||
      firstLine.includes("keyword") ||
      firstLine.includes("объем") ||
      firstLine.includes("kd");

    const startLine = hasHeaders ? 1 : 0;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      // Разделяем по табу или нескольким пробелам
      const parts = line.split(/\t|\s\s+/).filter((part) => part.trim());

      if (parts.length >= 3) {
        keywordsData.push({
          phrase: parts[0].trim(),
          volume: parseInt(parts[1].trim()) || 0,
          kd: parseFloat(parts[2].trim()) || 0,
          id: generateId(),
        });
      } else if (parts.length === 2) {
        keywordsData.push({
          phrase: parts[0].trim(),
          volume: parseInt(parts[1].trim()) || 0,
          kd: 0,
          id: generateId(),
        });
      } else if (parts.length === 1) {
        keywordsData.push({
          phrase: parts[0].trim(),
          volume: 0,
          kd: 0,
          id: generateId(),
        });
      }
    }

    // Удаление дубликатов (если включено)
    if (removeDupesCheckbox.checked) {
      return removeDuplicates(keywordsData);
    }

    return keywordsData;
  }

  // Удаление дубликатов
  function removeDuplicates(keywordsData) {
    const uniquePhrases = new Set();
    return keywordsData.filter((item) => {
      const normalizedPhrase = item.phrase.toLowerCase().trim();
      if (!uniquePhrases.has(normalizedPhrase)) {
        uniquePhrases.add(normalizedPhrase);
        return true;
      }
      return false;
    });
  }

  // Удаление гео-ключей
  function removeGeoKeywords(keywordsData) {
    if (!removeGeoCheckbox.checked) return keywordsData;

    const geoPatterns = [
      // Города
      /\b(москв[а-яё]*|санкт-петербург[а-яё]*|спб|новосибирск[а-яё]*|екатеринбург[а-яё]*|казан[а-яё]*|нижний новгород[а-яё]*|челябинск[а-яё]*|самар[а-яё]*|омск[а-яё]*|ростов[а-яё]*|уф[а-яё]*|красноярск[а-яё]*|перм[а-яё]*|воронеж[а-яё]*|волгоград[а-яё]*|краснодар[а-яё]*|сочи[а-яё]*|владивосток[а-яё]*|иркутск[а-яё]*|хабаровск[а-яё]*|ярославл[а-яё]*|тюмен[а-яё]*|тольятти[а-яё]*|барнаул[а-яё]*|ижевск[а-яё]*|махачкал[а-яё]*|хасан[а-яё]*|оренбург[а-яё]*|новгород[а-яё]*|кемеров[а-яё]*|рязан[а-яё]*|астрахан[а-яё]*|набережные челны|пенз[а-яё]*|липецк[а-яё]*|киров[а-яё]*|чебоксар[а-яё]*|калининград[а-яё]*|тул[а-яё]*|ставропол[а-яё]*|белгород[а-яё]*|архангельск[а-яё]*|владимир[а-яё]*|севастопол[а-яё]*|курск[а-яё]*|улан-удэ|чебоксар[а-яё]*|калуг[а-яё]*|брянск[а-яё]*|курган[а-яё]*|орл[а-яё]*|владикавказ[а-яё]*|псков[а-яё]*|мурманск[а-яё]*|донецк[а-яё]*|луганск[а-яё]*|симферопол[а-яё]*)\b/i,
      // Области и регионы
      /\b(московск[а-яё]*\s*обл[а-яё]*|ленинградск[а-яё]*\s*обл[а-яё]*|свердловск[а-яё]*\s*обл[а-яё]*|нижегородск[а-яё]*\s*обл[а-яё]*|челябинск[а-яё]*\s*обл[а-яё]*|самарск[а-яё]*\s*обл[а-яё]*|омск[а-яё]*\s*обл[а-яё]*|ростовск[а-яё]*\s*обл[а-яё]*|красноярск[а-яё]*\s*кра[яй]|пермск[а-яё]*\s*кра[яй]|краснодарск[а-яё]*\s*кра[яй]|алтайск[а-яё]*\s*кра[яй]|ставропольск[а-яё]*\s*кра[яй]|хабаровск[а-яё]*\s*кра[яй]|приморск[а-яё]*\s*кра[яй]|забайкальск[а-яё]*\s*кра[яй]|камчатск[а-яё]*\s*кра[яй])\b/i,
      // Страны
      /\b(росси[яи]|рф|украин[аы]|белорусси[яи]|казахстан[а]?|сша|америк[аи]|германи[яи]|франци[яи]|итали[яи]|испани[яи]|кита[яй]|япони[яи]|инди[яи]|бразили[яи]|канад[аы]|австрали[яи]|швейцари[яи]|швеци[яи]|норвеги[яи]|финлянди[яи]|польш[аи]|чехи[яи]|словаки[яи]|венгри[яи]|румыни[яи]|болгари[яи]|греци[яи]|турци[яи])\b/i,
    ];

    return keywordsData.filter((item) => {
      // Проверяем, содержит ли фраза любое гео-слово
      return !geoPatterns.some((pattern) => pattern.test(item.phrase));
    });
  }

  // Генератор ID
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Функция кластеризации (улучшенная)
  function clusterKeywords(keywordsData) {
    // Удаление гео-ключей (если включено)
    const filteredData = removeGeoKeywords(keywordsData);

    // Группировка по тематикам (упрощенный алгоритм)
    const groups = {};

    filteredData.forEach((item) => {
      // Разбиваем фразу на слова
      const words = item.phrase
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => word.length > 3);

      // Находим общие корни слов
      const stems = words.map((word) => {
        // Простая стемматизация (можно заменить на более сложный алгоритм)
        if (word.endsWith("ия") || word.endsWith("ая") || word.endsWith("ие")) {
          return word.slice(0, -2);
        }
        if (word.endsWith("ы") || word.endsWith("и") || word.endsWith("у")) {
          return word.slice(0, -1);
        }
        if (word.endsWith("ов") || word.endsWith("ев") || word.endsWith("ин")) {
          return word.slice(0, -2);
        }
        return word;
      });

      // Создаем ключ кластера на основе общих слов
      const clusterKey = stems.slice(0, 2).join(" ");

      if (!groups[clusterKey]) {
        groups[clusterKey] = [];
      }
      groups[clusterKey].push(item);
    });

    // Преобразуем в массив кластеров и сортируем по количеству фраз
    return Object.entries(groups)
      .map(([name, keywords]) => ({
        name: `Кластер: ${name}`,
        keywords,
        id: generateId(),
        collapsed: false,
      }))
      .sort((a, b) => b.keywords.length - a.keywords.length);
  }

  // Функция отрисовки кластеров
  function renderClusters() {
    clustersContainer.innerHTML = "";
    selectedKeywords.clear();
    updateSelectionButtons();

    if (clusters.length === 0) {
      clustersContainer.innerHTML =
        '<div class="status">Нет кластеров для отображения</div>';
      return;
    }

    clusters.forEach((cluster, clusterIndex) => {
      const clusterElement = document.createElement("div");
      clusterElement.className = `cluster ${
        cluster.collapsed ? "cluster-collapsed" : ""
      }`;
      clusterElement.dataset.clusterId = cluster.id;

      const selectAllId = `select-all-${cluster.id}`;

      clusterElement.innerHTML = `
                <div class="cluster-header">
                    <div class="cluster-title">
                        <input type="checkbox" id="${selectAllId}" class="select-all-checkbox">
                        <span>${cluster.name}</span>
                    </div>
                    <div>
                        <button class="delete-cluster" data-index="${clusterIndex}">
                            <i class="fas fa-trash"></i> Удалить кластер
                        </button>
                    </div>
                </div>
                <table class="keywords-table">
                    <thead>
                        <tr>
                            <th class="checkbox-cell"></th>
                            <th>Ключевая фраза</th>
                            <th>Объем</th>
                            <th>KD</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${cluster.keywords
                          .map(
                            (keyword, keywordIndex) => `
                            <tr data-keyword-id="${keyword.id}">
                                <td class="checkbox-cell"><input type="checkbox" class="keyword-checkbox" data-id="${keyword.id}"></td>
                                <td>${keyword.phrase}</td>
                                <td>${keyword.volume}</td>
                                <td>${keyword.kd}</td>
                                <td>
                                    <button class="add-to-articles" data-cluster="${clusterIndex}" data-keyword="${keywordIndex}">
                                        <i class="fas fa-plus"></i> В статьи
                                    </button>
                                    <button class="delete-keyword" data-cluster="${clusterIndex}" data-keyword="${keywordIndex}">
                                        <i class="fas fa-trash"></i> Удалить
                                    </button>
                                    <button class="exclude-keyword" data-cluster="${clusterIndex}" data-keyword="${keywordIndex}">
                                        <i class="fas fa-ban"></i> Исключить
                                    </button>
                                </td>
                            </tr>
                        `
                          )
                          .join("")}
                    </tbody>
                </table>
                <div class="status">Всего фраз: ${cluster.keywords.length}</div>
            `;

      clustersContainer.appendChild(clusterElement);

      // Обработчик сворачивания/разворачивания кластера
      const header = clusterElement.querySelector(".cluster-header");
      header.addEventListener("click", (e) => {
        if (
          !e.target.classList.contains("delete-cluster") &&
          !e.target.classList.contains("fa-trash") &&
          !e.target.classList.contains("select-all-checkbox") &&
          e.target.tagName !== "INPUT"
        ) {
          cluster.collapsed = !cluster.collapsed;
          clusterElement.classList.toggle("cluster-collapsed");
          saveAllData();
        }
      });

      // Обработчик выбора всех ключевых слов в кластере
      const selectAllCheckbox = clusterElement.querySelector(`#${selectAllId}`);
      selectAllCheckbox.addEventListener("change", function () {
        const checkboxes = clusterElement.querySelectorAll(".keyword-checkbox");
        checkboxes.forEach((checkbox) => {
          checkbox.checked = this.checked;
          const keywordId = checkbox.dataset.id;
          if (this.checked) {
            selectedKeywords.add(keywordId);
          } else {
            selectedKeywords.delete(keywordId);
          }
        });
        updateSelectionButtons();
      });
    });

    // Добавляем обработчики для чекбоксов
    document.querySelectorAll(".keyword-checkbox").forEach((checkbox) => {
      checkbox.addEventListener("change", function () {
        const keywordId = this.dataset.id;
        if (this.checked) {
          selectedKeywords.add(keywordId);
        } else {
          selectedKeywords.delete(keywordId);
        }
        updateSelectionButtons();
      });
    });

    // Добавляем обработчики для кнопок удаления кластеров
    document.querySelectorAll(".delete-cluster").forEach((button) => {
      button.addEventListener("click", function (e) {
        e.stopPropagation();
        const index = parseInt(this.dataset.index);
        lastDeletedItems = {
          type: "cluster",
          data: clusters[index],
          index: index,
        };
        clusters.splice(index, 1);
        renderClusters();
        showUndoButton();
        saveAllData();
      });
    });

    // Добавляем обработчики для кнопок удаления ключевых слов
    document.querySelectorAll(".delete-keyword").forEach((button) => {
      button.addEventListener("click", function (e) {
        e.stopPropagation();
        const clusterIndex = parseInt(this.dataset.cluster);
        const keywordIndex = parseInt(this.dataset.keyword);
        const cluster = clusters[clusterIndex];
        const keyword = cluster.keywords[keywordIndex];

        // Удаляем ключевое слово
        cluster.keywords.splice(keywordIndex, 1);

        // Если кластер пуст, удаляем его
        if (cluster.keywords.length === 0) {
          clusters.splice(clusterIndex, 1);
        }

        // Показываем кнопку "Вернуть" рядом с удаленным элементом
        const keywordId = keyword.id;
        const keywordRow = document.querySelector(
          `tr[data-keyword-id="${keywordId}"]`
        );
        if (keywordRow) {
          const undoButton = document.createElement("button");
          undoButton.className = "keyword-delete-undo";
          undoButton.innerHTML = '<i class="fas fa-undo"></i> Вернуть';
          undoButton.onclick = (e) => {
            e.stopPropagation();
            undoKeywordDelete(keywordId, clusterIndex, keywordIndex, keyword);
          };

          const cell = keywordRow.querySelector("td:last-child");
          if (cell) {
            cell.innerHTML = "";
            cell.appendChild(undoButton);

            // Удаляем кнопку через 5 секунд
            setTimeout(() => {
              if (cell.contains(undoButton)) {
                cell.innerHTML = "";
                renderClusters();
              }
            }, 3000);
          }
        }

        // Сохраняем информацию для отмены
        lastDeletedItems = {
          type: "keyword",
          data: keyword,
          clusterIndex: clusterIndex,
          keywordIndex: keywordIndex,
        };

        saveAllData();
      });
    });

    // Добавляем обработчики для кнопок добавления в статьи
    document.querySelectorAll(".add-to-articles").forEach((button) => {
      button.addEventListener("click", function (e) {
        e.stopPropagation();
        const clusterIndex = parseInt(this.dataset.cluster);
        const keywordIndex = parseInt(this.dataset.keyword);
        const keyword = clusters[clusterIndex].keywords[keywordIndex];

        // Добавляем в статьи, если еще нет
        if (!articles.some((item) => item.id === keyword.id)) {
          articles.push({ ...keyword });
          renderArticles();
          exportArticlesButton.disabled = false;
          clearArticlesButton.disabled = false;
        }

        // Удаляем из кластера
        clusters[clusterIndex].keywords.splice(keywordIndex, 1);

        // Если кластер пуст, удаляем его
        if (clusters[clusterIndex].keywords.length === 0) {
          clusters.splice(clusterIndex, 1);
        }

        renderClusters();
        saveAllData();
      });
    });

    // Добавляем обработчики для кнопок исключения
    document.querySelectorAll(".exclude-keyword").forEach((button) => {
      button.addEventListener("click", function (e) {
        e.stopPropagation();
        const clusterIndex = parseInt(this.dataset.cluster);
        const keywordIndex = parseInt(this.dataset.keyword);
        const keyword = clusters[clusterIndex].keywords[keywordIndex];

        // Добавляем фразу в исключения
        addExclusion(keyword.phrase);

        // Удаляем из кластера
        clusters[clusterIndex].keywords.splice(keywordIndex, 1);

        // Если кластер пуст, удаляем его
        if (clusters[clusterIndex].keywords.length === 0) {
          clusters.splice(clusterIndex, 1);
        }

        renderClusters();
        saveAllData();
      });
    });
  }

  // Функция для отмены удаления ключевого слова
  function undoKeywordDelete(keywordId, clusterIndex, keywordIndex, keyword) {
    // Проверяем, существует ли еще кластер
    if (clusterIndex < clusters.length) {
      clusters[clusterIndex].keywords.splice(keywordIndex, 0, keyword);
    } else {
      // Если кластер был удален, создаем новый с этим ключевым словом
      clusters.push({
        name: `Кластер: ${keyword.phrase.split(" ").slice(0, 2).join(" ")}`,
        keywords: [keyword],
        id: generateId(),
        collapsed: false,
      });
    }

    renderClusters();
    saveAllData();
  }

  // Функция отрисовки статей
  function renderArticles() {
    articlesContainer.innerHTML = "";

    if (articles.length === 0) {
      articlesContainer.innerHTML =
        '<div class="status">Нет добавленных фраз</div>';
      exportArticlesButton.disabled = true;
      clearArticlesButton.disabled = true;
      return;
    }

    articles.forEach((article, index) => {
      const articleElement = document.createElement("div");
      articleElement.className = "article-item";
      articleElement.dataset.articleId = article.id;
      articleElement.innerHTML = `
                <span>${article.phrase} (Объем: ${article.volume}, KD: ${article.kd})</span>
                <button class="remove-article" data-index="${index}">
                    <i class="fas fa-times"></i> Удалить
                </button>
            `;
      articlesContainer.appendChild(articleElement);
    });

    // Добавляем обработчики для кнопок удаления статей
    document.querySelectorAll(".remove-article").forEach((button) => {
      button.addEventListener("click", function () {
        const index = parseInt(this.dataset.index);
        articles.splice(index, 1);
        renderArticles();
        saveAllData();
      });
    });
  }

  // Функция отрисовки списка исключений
  function renderExclusions() {
    exclusionsList.innerHTML = "";

    if (exclusions.length === 0) {
      exclusionsList.innerHTML = '<div class="status">Нет исключений</div>';
      return;
    }

    exclusions.forEach((exclusion, index) => {
      const exclusionElement = document.createElement("div");
      exclusionElement.className = "exclusion-item";
      exclusionElement.innerHTML = `
                <span>${exclusion}</span>
                <button class="remove-exclusion" data-index="${index}">
                    <i class="fas fa-times"></i> Удалить
                </button>
            `;
      exclusionsList.appendChild(exclusionElement);
    });

    // Добавляем обработчики для кнопок удаления исключений
    document.querySelectorAll(".remove-exclusion").forEach((button) => {
      button.addEventListener("click", function () {
        const index = parseInt(this.dataset.index);
        exclusions.splice(index, 1);
        renderExclusions();
        saveAllData();
      });
    });
  }

  // Функция обновления состояния кнопок выбора
  function updateSelectionButtons() {
    const hasSelection = selectedKeywords.size > 0;

    if (hasSelection) {
      floatingActions.style.display = "flex";
      deleteSelectedButton.disabled = false;
      addSelectedToArticlesButton.disabled = false;
      excludeSelectedButton.disabled = false;
    } else {
      floatingActions.style.display = "none";
      deleteSelectedButton.disabled = true;
      addSelectedToArticlesButton.disabled = true;
      excludeSelectedButton.disabled = true;
    }
  }

  // Функция удаления выбранных ключевых слов
  function deleteSelectedKeywords() {
    if (selectedKeywords.size === 0) return;

    lastDeletedItems = {
      type: "multiple",
      data: [],
    };

    // Проходим по всем кластерам и удаляем выбранные ключевые слова
    for (let i = clusters.length - 1; i >= 0; i--) {
      const cluster = clusters[i];

      for (let j = cluster.keywords.length - 1; j >= 0; j--) {
        const keyword = cluster.keywords[j];

        if (selectedKeywords.has(keyword.id)) {
          lastDeletedItems.data.push({
            keyword: { ...keyword },
            clusterIndex: i,
            keywordIndex: j,
          });

          cluster.keywords.splice(j, 1);
        }
      }

      // Если кластер пуст, удаляем его
      if (cluster.keywords.length === 0) {
        clusters.splice(i, 1);
      }
    }

    selectedKeywords.clear();
    renderClusters();
    showUndoButton();
    saveAllData();
  }

  // Функция добавления выбранных ключевых слов в статьи
  function addSelectedToArticles() {
    if (selectedKeywords.size === 0) return;

    // Проходим по всем кластерам и добавляем выбранные ключевые слова в статьи
    for (let i = clusters.length - 1; i >= 0; i--) {
      const cluster = clusters[i];

      for (let j = cluster.keywords.length - 1; j >= 0; j--) {
        const keyword = cluster.keywords[j];

        if (selectedKeywords.has(keyword.id)) {
          // Добавляем в статьи, если еще нет
          if (!articles.some((item) => item.id === keyword.id)) {
            articles.push({ ...keyword });
          }

          // Удаляем из кластера
          cluster.keywords.splice(j, 1);
        }
      }

      // Если кластер пуст, удаляем его
      if (cluster.keywords.length === 0) {
        clusters.splice(i, 1);
      }
    }

    selectedKeywords.clear();
    renderClusters();
    renderArticles();
    saveAllData();
  }

  // Функция исключения выбранных ключевых слов
  function excludeSelectedKeywords() {
    if (selectedKeywords.size === 0) return;

    // Проходим по всем кластерам и добавляем выбранные ключевые слова в исключения
    for (let i = clusters.length - 1; i >= 0; i--) {
      const cluster = clusters[i];

      for (let j = cluster.keywords.length - 1; j >= 0; j--) {
        const keyword = cluster.keywords[j];

        if (selectedKeywords.has(keyword.id)) {
          // Добавляем в исключения, если еще нет
          if (!exclusions.includes(keyword.phrase.toLowerCase())) {
            addExclusion(keyword.phrase);
          }

          // Удаляем из кластера
          cluster.keywords.splice(j, 1);
        }
      }

      // Если кластер пуст, удаляем его
      if (cluster.keywords.length === 0) {
        clusters.splice(i, 1);
      }
    }

    selectedKeywords.clear();
    renderClusters();
    saveAllData();
  }

  // Функция добавления исключения
  function addExclusion(phrase) {
    const normalizedPhrase = phrase.toLowerCase().trim();
    if (normalizedPhrase && !exclusions.includes(normalizedPhrase)) {
      exclusions.push(normalizedPhrase);
      renderExclusions();
      applyExclusions();
      saveAllData();
    }
  }

  // Функция добавления исключений из текстового поля
  function addExclusions() {
    const phrases = exclusionsInput.value
      .split("\n")
      .map((phrase) => phrase.trim())
      .filter((phrase) => phrase);

    if (phrases.length === 0) return;

    phrases.forEach((phrase) => {
      if (!exclusions.includes(phrase.toLowerCase())) {
        exclusions.push(phrase.toLowerCase());
      }
    });

    exclusionsInput.value = "";
    renderExclusions();
    applyExclusions();
    saveAllData();
  }

  // Функция очистки исключений
  function clearExclusions() {
    if (confirm("Вы уверены, что хотите очистить список исключений?")) {
      exclusions = [];
      renderExclusions();
      saveAllData();
    }
  }

  // Функция применения исключений к кластерам
  function applyExclusions() {
    if (exclusions.length === 0) return;

    for (let i = clusters.length - 1; i >= 0; i--) {
      const cluster = clusters[i];

      for (let j = cluster.keywords.length - 1; j >= 0; j--) {
        const keyword = cluster.keywords[j];
        const keywordLower = keyword.phrase.toLowerCase();

        // Проверяем, содержит ли ключевая фраза любое из исключенных слов
        if (exclusions.some((exclusion) => keywordLower.includes(exclusion))) {
          cluster.keywords.splice(j, 1);
        }
      }

      // Если кластер пуст, удаляем его
      if (cluster.keywords.length === 0) {
        clusters.splice(i, 1);
      }
    }

    renderClusters();
  }

  // Функция отображения кнопки "Вернуть"
  function showUndoButton() {
    if (lastDeletedItems) {
      undoSection.style.display = "block";
    } else {
      undoSection.style.display = "none";
    }
  }

  // Функция отмены последнего удаления
  function undoLastDelete() {
    if (!lastDeletedItems) return;

    if (lastDeletedItems.type === "cluster") {
      clusters.splice(lastDeletedItems.index, 0, lastDeletedItems.data);
    } else if (lastDeletedItems.type === "keyword") {
      // Проверяем, существует ли еще кластер
      if (lastDeletedItems.clusterIndex < clusters.length) {
        clusters[lastDeletedItems.clusterIndex].keywords.splice(
          lastDeletedItems.keywordIndex,
          0,
          lastDeletedItems.data
        );
      } else {
        // Если кластер был удален, создаем новый с этим ключевым словом
        clusters.push({
          name: `Кластер: ${lastDeletedItems.data.phrase
            .split(" ")
            .slice(0, 2)
            .join(" ")}`,
          keywords: [lastDeletedItems.data],
          id: generateId(),
          collapsed: false,
        });
      }
    } else if (lastDeletedItems.type === "multiple") {
      // Восстанавливаем в обратном порядке, чтобы сохранить индексы
      lastDeletedItems.data.reverse().forEach((item) => {
        // Проверяем, существует ли еще кластер
        if (item.clusterIndex < clusters.length) {
          clusters[item.clusterIndex].keywords.splice(
            item.keywordIndex,
            0,
            item.keyword
          );
        } else {
          // Если кластер был удален, создаем новый с этим ключевым словом
          clusters.push({
            name: `Кластер: ${item.keyword.phrase
              .split(" ")
              .slice(0, 2)
              .join(" ")}`,
            keywords: [item.keyword],
            id: generateId(),
            collapsed: false,
          });
        }
      });
    }

    lastDeletedItems = null;
    renderClusters();
    showUndoButton();
    saveAllData();
  }

  // Функция очистки всех данных
  function clearAllData() {
    if (confirm("Вы уверены, что хотите полностью очистить все данные?")) {
      clusters = [];
      articles = [];
      exclusions = [];
      keywordsInput.value = "";
      exclusionsInput.value = "";
      lastDeletedItems = null;
      selectedKeywords.clear();

      renderClusters();
      renderArticles();
      renderExclusions();
      showUndoButton();
      updateSelectionButtons();

      exportButton.disabled = true;
      exportArticlesButton.disabled = true;
      clearArticlesButton.disabled = true;

      // Очищаем localStorage
      localStorage.removeItem("clusteringAppData");
      localStorage.removeItem("keywordsInput");
      localStorage.removeItem("exclusionsInput");
    }
  }

  // Функция очистки статей
  function clearArticles() {
    if (confirm("Вы уверены, что хотите очистить список статей?")) {
      articles = [];
      renderArticles();
      saveAllData();
    }
  }

  // Функция симуляции прогресса
  function simulateProgress(callback) {
    clusterButton.disabled = true;
    let progress = 0;
    const interval = setInterval(() => {
      progress += 2;
      if (progress > 100) {
        progress = 100;
        clearInterval(interval);
        clusterButton.disabled = false;
        if (callback) callback();
      }

      progressBar.style.setProperty("--progress", `${progress}%`);
      progressText.textContent = `${progress}%`;
    }, 50);
  }

  // Функция экспорта кластеров в Excel
  function exportClustersToExcel() {
    // Создаем новую книгу Excel
    const wb = XLSX.utils.book_new();

    // Подготавливаем данные для каждого кластера
    clusters.forEach((cluster, index) => {
      // Преобразуем данные кластера в массив массивов
      const clusterData = [
        [cluster.name], // Заголовок кластера
        ["Ключевая фраза", "Объем", "KD"], // Заголовки столбцов
        ...cluster.keywords.map((keyword) => [
          keyword.phrase,
          keyword.volume,
          keyword.kd,
        ]),
      ];

      // Создаем лист Excel
      const ws = XLSX.utils.aoa_to_sheet(clusterData);

      // Добавляем лист в книгу
      XLSX.utils.book_append_sheet(wb, ws, `Кластер ${index + 1}`);

      // Устанавливаем стиль для заголовка кластера
      if (!wb.SSF) wb.SSF = {};
      const headerStyle = {
        fill: { fgColor: { rgb: "D3D3D3" } }, // Серый фон
        font: { bold: true },
      };

      // Применяем стиль к заголовку кластера
      const headerCell = { t: "s", v: cluster.name };
      ws["A1"] = headerCell;
      ws["A1"].s = headerStyle;

      // Объединяем ячейки для заголовка кластера
      if (!ws["!merges"]) ws["!merges"] = [];
      ws["!merges"].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } });
    });

    // Генерируем файл Excel и скачиваем его
    XLSX.writeFile(wb, "Кластеризация_ключевых_фраз.xlsx");
  }

  // Функция экспорта статей в Excel
  function exportArticlesToExcel() {
    if (articles.length === 0) {
      alert("Нет фраз для экспорта");
      return;
    }

    // Создаем новую книгу Excel
    const wb = XLSX.utils.book_new();

    // Преобразуем данные статей в массив массивов
    const articlesData = [
      ["Фразы для статей"], // Заголовок
      ["Ключевая фраза", "Объем", "KD"], // Заголовки столбцов
      ...articles.map((article) => [
        article.phrase,
        article.volume,
        article.kd,
      ]),
    ];

    // Создаем лист Excel
    const ws = XLSX.utils.aoa_to_sheet(articlesData);

    // Добавляем лист в книгу
    XLSX.utils.book_append_sheet(wb, ws, "Фразы для статей");

    // Устанавливаем стиль для заголовка
    if (!wb.SSF) wb.SSF = {};
    const headerStyle = {
      fill: { fgColor: { rgb: "D3D3D3" } }, // Серый фон
      font: { bold: true },
    };

    // Применяем стиль к заголовку
    const headerCell = { t: "s", v: "Фразы для статей" };
    ws["A1"] = headerCell;
    ws["A1"].s = headerStyle;

    // Объединяем ячейки для заголовка
    if (!ws["!merges"]) ws["!merges"] = [];
    ws["!merges"].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } });

    // Генерируем файл Excel и скачиваем его
    XLSX.writeFile(wb, "Фразы_для_статей.xlsx");
  }

  // Сохранение всех данных в localStorage
  function saveAllData() {
    const appData = {
      clusters: clusters,
      articles: articles,
      exclusions: exclusions,
      lastDeletedItems: lastDeletedItems,
    };
    saveToLocalStorage("clusteringAppData", JSON.stringify(appData));
    saveToLocalStorage("exclusionsInput", exclusionsInput.value);
  }

  // Загрузка сохраненных данных из localStorage
  function loadSavedData() {
    // Загрузка введенных ключевых слов
    const savedInput = loadFromLocalStorage("keywordsInput");
    if (savedInput) {
      keywordsInput.value = savedInput;
    }

    // Загрузка исключений
    const savedExclusionsInput = loadFromLocalStorage("exclusionsInput");
    if (savedExclusionsInput) {
      exclusionsInput.value = savedExclusionsInput;
    }

    // Загрузка состояния приложения
    const savedData = loadFromLocalStorage("clusteringAppData");
    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData);
        clusters = parsedData.clusters || [];
        articles = parsedData.articles || [];
        exclusions = parsedData.exclusions || [];
        lastDeletedItems = parsedData.lastDeletedItems || null;

        renderClusters();
        renderArticles();
        renderExclusions();
        showUndoButton();

        exportButton.disabled = clusters.length === 0;
        exportArticlesButton.disabled = articles.length === 0;
        clearArticlesButton.disabled = articles.length === 0;
      } catch (e) {
        console.error("Ошибка загрузки данных:", e);
      }
    }
  }

  // Вспомогательные функции для работы с localStorage
  function saveToLocalStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.error("Ошибка сохранения в localStorage:", e);
    }
  }

  function loadFromLocalStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.error("Ошибка загрузки из localStorage:", e);
      return null;
    }
  }
});

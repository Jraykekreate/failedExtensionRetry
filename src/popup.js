import { triggerFilter } from "./serviceWorker";
import { semanticSimilarity } from "./semanticSimilarity";
const inputText = document.querySelector('.inputText');
const filterButton = document.getElementById('filter');
const filterMark = document.getElementById('filterMark');

filterButton.addEventListener("click", () => {
    triggerFilter(inputText.value, true);
    window.close();
});
filterMark.addEventListener("click", () => {
    triggerFilter(inputText.value, false);
    window.close();
});

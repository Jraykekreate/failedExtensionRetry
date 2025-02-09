import { triggerFilter } from "./serviceWorker";
import { semanticSimilarity } from "./semanticSimilarity";
const inputText = document.querySelector('.inputText');
const filterButton = document.getElementById('filter');


filterButton.addEventListener("click", () => triggerFilter(inputText.value));
const res = async () => {
    const result = await semanticSimilarity("hello", "hi");
    alert(result);
}
res();

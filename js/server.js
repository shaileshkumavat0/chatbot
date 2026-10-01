// const BASE_URL =
//   "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies";

// const dropdowns = document.querySelectorAll(".dropdown select");
// const btn = document.querySelector("form button");
// const fromCurr = document.querySelector(".from select");
// const toCurr = document.querySelector(".to select");
// const msg = document.querySelector(".msg");

// for (select of dropdowns) {
//   for (currCode in countryList) {
//     let newOption = document.createElement("option");
//     newOption.innerText = currCode;
//     if (select.name === "from" && currCode === "USD") {
//       newOption.selected = "selected";
//     } else if (select.name === "to" && currCode === "INR") {
//       newOption.selected = "selected";
//     }
//     newOption.value = currCode;
//     select.append(newOption);
//   }
//   select.addEventListener("change", (evt) => {
//     updateFlag(evt.target);
//   });
// }

// const updateFlag = (element) => {
//   let currCode = element.value;
//   let countryCode = countryList[currCode];
//   let newSrc = `https://flagsapi.com/${countryCode}/flat/64.png`;
//   let img = element.parentElement.querySelector("img");
//   img.src = newSrc;
// };

// btn.addEventListener("click", async (evt) => {
//   evt.preventDefault();
//   let amount = document.querySelector(".amount input");
//   let amtVal = amount.value;
//   if (amtVal === "" || amtVal < 1) {
//     amtVal = 1;
//     amount.value = 1;
//   }
//   const URL = `${BASE_URL}/${fromCurr.value.toLowerCase()}.json`;
//   let response = await fetch(URL);
//   let data = await response.json();
//   let rate = data[fromCurr.value.toLowerCase()][toCurr.value.toLowerCase()];

//   let finalAmount = amtVal * rate;
//   msg.innerHTML = `${amtVal} ${fromCurr.value} = ${finalAmount} ${toCurr.value}`
// });

let input = document.querySelector("input");
let btn = document.querySelector("button");
let ul = document.querySelector("ul");
let list = document.querySelectorAll("li");
let spans = document.querySelectorAll("span");

    

btn.addEventListener("click", function () {
  let li = document.createElement("li");
  let span = document.createElement("span");
  let div = document.querySelector("div");
  span.innerText = "del";

  li.innerText = input.value;
  li.append(span);
  ul.appendChild(li);
  console.log("todo is added!");
  div.style.borderColor = "blue";
  setTimeout(() => {
    div.style.borderColor = "black";
  }, 1000);
  input.value = "";
});

ul.addEventListener("click", function (evt) {
  if (evt.target.nodeName == "SPAN") {
    let del = evt.target.parentElement;
    del.remove();
  }
});

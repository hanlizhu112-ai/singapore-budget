function calculateBudget() {
  const flight = Number(document.getElementById("flight").value) || 0;
  const hotel = Number(document.getElementById("hotel").value) || 0;
  const food = Number(document.getElementById("food").value) || 0;
  const transport = Number(document.getElementById("transport").value) || 0;
  const ticket = Number(document.getElementById("ticket").value) || 0;
  const shopping = Number(document.getElementById("shopping").value) || 0;
  const other = Number(document.getElementById("other").value) || 0;

  const total = flight + hotel + food + transport + ticket + shopping + other;

  const budgetLimit = 5000;

  let message = "";

  if (total <= budgetLimit) {
    message = "预算可控，可以出发。";
  } else {
    message = "预算超支，建议压缩机票、酒店或购物预算。";
  }

  document.getElementById("result").innerHTML = `
    <strong>总预算：${total} 元</strong><br>
    预算上限：${budgetLimit} 元<br>
    判断结果：${message}
  `;
}
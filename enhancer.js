(function($) {

  var winPercentClassName = "winPct";

  var getData = function() {

    // pull team names for each game from the page
    var games = [];
    var titleRows = $('#nflpicks tr.subtitle');
    $(titleRows[0]).find('.bg4 td:first-child').each(function(index) {
      var isHome = index % 2;
      var gameIndex = (index - isHome) / 2;
      var teamName = $(this).text();

      if(isHome) {
        games[gameIndex].homeTeam = teamName;
      }
      else {
        games[gameIndex] = { awayTeam: teamName };
      }
    });

    // pull data for each player's picks from the page
    var players = [];
    var currentPlayer = {};
    var playerRows = $('#nflplayerRows tr');
    playerRows.each(function(playerIndex, playerRow) {
      var player = { picks: [], winShares: 0, outcomesToWinShares: {}, row: playerRow };
      var isCurrent = $(playerRow).hasClass('bgFan');
      if(isCurrent) {
        player.isCurrent = true;
        currentPlayer = player;
      }

      var pickIndex = 0;
      $.each(playerRow.cells, function(cellIndex, cell) {
       cell = $(cell);
       if(cellIndex > 0 && !cell.hasClass(winPercentClassName)) {

          if(pickIndex == games.length) return false;

          var pick = cell.text();
          player.picks[pickIndex] = pick;

          var game = games[pickIndex++];
          game.unlocked |= cell.hasClass("unlocked");

          // this is the only way to tell the outcome of the game
          var isCorrect = cell.hasClass("correct");
          var isInProgress = cell.hasClass('inprogress');
          if(!isInProgress && (isCorrect || cell.hasClass("incorrect"))) {
            game.winner = isCorrect? pick : (pick == game.homeTeam)? game.awayTeam : game.homeTeam;
          }
        }
      });
      players.push(player);
    });

    var gamesToGo = 0;
    var possibleOutcomes = 1;
    $.each(games, function(gameIndex, game) {
      if(game.unlocked) {
        gamesToGo++
      }
      else if(!game.winner) {
        possibleOutcomes *= 2;
      }
    });

    // accumulate data about which player wins in all possible outcome permutations
    accumulateAllPossibilities({ toGo: gamesToGo, games: games }, players, [], 0);

    return {
      games: games,
      players: players,
      currentPlayer: currentPlayer,
      possibleOutcomes: possibleOutcomes,
      titleRows: titleRows,
      playerRows: playerRows
    }
  };

  // recursively try every outcome permutation and accumulate win stats data for each
  var accumulateAllPossibilities = function(gameData, players, outcomes, currentIndex) {

    // we've worked through all the games, time to calculate who won with these outcomes
    if(gameData.games.length == currentIndex) {
      accumulateWinShares(gameData.toGo, players, outcomes);
      return;
    }

    // if this game is already decided, add the actual winner to the outcome, and recurse
    // or if picks aren't revealed yet for this game, no need to explore either outcome
    if(gameData.games[currentIndex].winner || gameData.games[currentIndex].unlocked) {
      outcomes[currentIndex] = gameData.games[currentIndex].winner || "";
      accumulateAllPossibilities(gameData, players, outcomes, currentIndex + 1);
    }

    // otherwise recursively branch to both possible outcomes
    else {
      var outcomes1 = outcomes.slice();
      outcomes1[currentIndex] = gameData.games[currentIndex].homeTeam;

      var outcomes2 = outcomes.slice();
      outcomes2[currentIndex] = gameData.games[currentIndex].awayTeam;

      accumulateAllPossibilities(gameData, players, outcomes1, currentIndex + 1);
      accumulateAllPossibilities(gameData, players, outcomes2, currentIndex + 1);
    }
  };

  var accumulateWinShares = function(gamesToGo, players, outcomes) {
    var results = getResults(gamesToGo, players, outcomes);
    var previousWinShares = 0;

    for(var score = 0; score <= outcomes.length; score++) {
      var resultsForScore = results[score];
      if(resultsForScore) {
        var winShare = resultsForScore.chanceToOvertake - (previousWinShares / resultsForScore.playersWithScore.length);
        $.each(resultsForScore.playersWithScore, function(playerIndex, player) {
          if(winShare > 0) {
            player.winShares += winShare;
            previousWinShares += winShare
            if(player.isCurrent) {
              // outcomeToWins maps a team name the number of wins for this player when that team wins
              $.each(outcomes, function(gameIndex, outcome) {
                player.outcomesToWinShares[outcome] = (player.outcomesToWinShares[outcome] || 0) + winShare;
              });
            }
          }
        });
      }
    }
  };

  var getResults = function(gamesToGo, players, outcomes) {
    var results = {};
    $.each(players, function(playerIndex, player){
      var score = 0;
      $.each(outcomes, function(outcomeIndex, outcome) {
        if(player.picks[outcomeIndex] === outcome) score++;
      });
      if(!results[score]) {
        results[score] = { chanceToOvertake: 0, playersWithScore: [] };
      }
      results[score].playersWithScore.push(player);
    });

    var playersTiedOrAhead = 0;
    var gamesBack = 0;
    var totalGamesToMakeUp = 0;
    for(var score = outcomes.length; score >= 0; score--) {
      var resultsForScore = results[score];
      if(resultsForScore) {
        playersTiedOrAhead += resultsForScore.playersWithScore.length;
        resultsForScore.chanceToOvertake = chanceToWin(gamesBack, totalGamesToMakeUp, gamesToGo, playersTiedOrAhead);
      }
      gamesBack = Math.min(playersTiedOrAhead, gamesBack + 1);
      totalGamesToMakeUp += playersTiedOrAhead;
    }
    return results;
  };

  var chanceToWin = function(gamesBack, totalGamesToMakeUp, gamesToGo, playersTiedOrAhead) {
    if(gamesBack > gamesToGo) {
      return 0;
    }
    var chanceOfFirstPlace = gamesToGo === 0? 1 : chanceToMakeUpGames(gamesBack, gamesToGo);
    return chanceOfFirstPlace / playersTiedOrAhead;
  };

  var chanceToMakeUpGames = function(gamesBack, gamesToGo) {
    var total = 0;
    for(var x = gamesBack; x <= gamesToGo; x++) {
       total += chooseXFromN(x, gamesToGo);
    }
    return total;
  };

  var chooseXFromN = function(x, n) {
    return (fact(n) / (fact(x) * fact(n - x))) * Math.pow(p, x) * Math.pow(1 - p, n - x);
  };

  var fact = function(x) {
    if(x < 2) return 1;
    else return x * fact(x - 1);
  };

  var addDataToPage = function(data) {
    addColumn(1, data, 'Win<br>Chance', winPercentClassName, function(player) {
      return getWinPct(player.winShares, data.possibleOutcomes) + "%";
    });

   var customRow = data.titleRows[3];
    if(!customRow) {
      var text = '<tr class="subtitle">';
      for(var i = 0; i < data.titleRows[2].cells.length; i++) text += '<td></td>';
      text += '</tr>';
      customRow = $(text);
      $(data.titleRows[2]).after(customRow);
    }
    customRow = $(customRow);

    $.each(customRow.find('td'), function(index, cell) {

      var html = "";
      switch(index) {
        case 0: html = "Win chances<br/>by game"; break;
        default: {
          var gameIndex = index - 2;
          var game = data.games[gameIndex];
          if(game) {
            var homeWinPct = getWinPct(data.currentPlayer.outcomesToWinShares[game.homeTeam], data.possibleOutcomes);
            var homeColor = game.homeTeam == data.currentPlayer.picks[gameIndex]? "#40a251" : "#d8383a";
            var awayWinPct = getWinPct(data.currentPlayer.outcomesToWinShares[game.awayTeam], data.possibleOutcomes);
            var awayColor = game.awayTeam == data.currentPlayer.picks[gameIndex]? "#40a251" : "#d8383a";
            html = '<span style="color:' + homeColor + '">' + homeWinPct + '%</span> <br> ' +
                   '<span style="color:' + awayColor + '">' + awayWinPct + '%</span>';
          }
        }
      }
      $(cell).html(html);
    });
  };

  var addColumn = function(index, data, title, className, playerToTextFn) {
    $.each(data.titleRows, function(rowIndex, titleRow) {
      var existingCell = $(titleRow.cells[index]);
      var text = rowIndex == 0? title : '';
      if(existingCell.hasClass(className)) {
        existingCell.html(text);
      }
      else {
        var cellBefore = $(titleRow.cells[index - 1]);
        cellBefore.after($('<td class="' + className + '">' + text +'</td>'));
      }
    });

    $.each(data.players, function(playerIndex, player) {
      var existingCell = $(player.row.cells[index]);
      if(existingCell.hasClass(className)) {
        existingCell.html(playerToTextFn(player));
      }
      else {
        var cellBefore = $(player.row.cells[index - 1]);
        cellBefore.after($('<td class="' + className + '">' + playerToTextFn(player) +'</td>'));
      }
    });
  };

  var getWinPct = function(winShares, possibleOutcomes) {
    winShares = winShares || 0;
    return Math.round((winShares * 10000) / possibleOutcomes) / 100;
  };

  var run = function() {
    addDataToPage(getData());
  };

  run();
  setInterval(run, 30 * 1000);

})(jQuery);